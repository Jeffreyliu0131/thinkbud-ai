import type {
  CollectedLlmStream,
  LlmCallMetadata,
  LlmCompletion,
  LlmErrorCode,
  LlmErrorMetadata,
  LlmProvider,
  LlmRequest,
  LlmStreamEvent,
  LlmStreamHandle,
} from './types'

export class LlmGatewayError extends Error {
  readonly code: LlmErrorCode
  readonly retryable: boolean
  readonly status?: number
  callMetadata?: LlmCallMetadata

  constructor(
    code: LlmErrorCode,
    message: string,
    retryable: boolean,
    status?: number,
  ) {
    super(message)
    this.name = 'LlmGatewayError'
    this.code = code
    this.retryable = retryable
    this.status = status
  }

  metadata(): LlmErrorMetadata {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.status === undefined ? {} : { status: this.status }),
    }
  }

  attachCallMetadata(metadata: LlmCallMetadata): this {
    this.callMetadata = metadata
    return this
  }
}

export interface LlmGatewayOptions {
  timeoutMs?: number
}

function elapsed(started: number): number {
  return Math.round((performance.now() - started) * 100) / 100
}

function normalizeError(error: unknown, timedOut: boolean, aborted: boolean): LlmGatewayError {
  if (error instanceof LlmGatewayError) return error
  if (timedOut) return new LlmGatewayError('LLM_TIMEOUT', 'LLM request timed out', true)
  if (aborted) return new LlmGatewayError('LLM_ABORTED', 'LLM request was aborted', true)
  if (error instanceof Error) return new LlmGatewayError('LLM_PROVIDER_ERROR', error.message, true)
  return new LlmGatewayError('LLM_PROVIDER_ERROR', 'Unknown LLM provider error', true)
}

function linkedController(externalSignal: AbortSignal | undefined, timeoutMs: number): {
  controller: AbortController
  cleanup: () => void
  didTimeout: () => boolean
} {
  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort(externalSignal?.reason)
  externalSignal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('Timed out', 'TimeoutError'))
  }, timeoutMs)
  return {
    controller,
    cleanup: () => {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onAbort)
    },
    didTimeout: () => timedOut,
  }
}

export class LlmGateway {
  readonly timeoutMs: number
  readonly provider: LlmProvider

  constructor(provider: LlmProvider, options: LlmGatewayOptions = {}) {
    this.provider = provider
    this.timeoutMs = options.timeoutMs ?? 25_000
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new LlmGatewayError('LLM_CONFIGURATION', 'LLM timeout must be positive', false)
    }
  }

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmCompletion> {
    const started = performance.now()
    const startedAt = new Date().toISOString()
    const linked = linkedController(signal, this.timeoutMs)
    try {
      const result = await this.provider.complete(request, { signal: linked.controller.signal })
      if (!result.text) throw new LlmGatewayError('LLM_EMPTY_RESPONSE', 'LLM returned empty content', true)
      return {
        text: result.text,
        metadata: {
          providerId: this.provider.id,
          model: result.model,
          mode: 'complete',
          startedAt,
          durationMs: elapsed(started),
          timeoutMs: this.timeoutMs,
          timedOut: false,
          ...(result.requestId ? { requestId: result.requestId } : {}),
          ...(result.finishReason ? { finishReason: result.finishReason } : {}),
          ...(result.usage ? { usage: result.usage } : {}),
        },
      }
    } catch (error) {
      const normalized = normalizeError(error, linked.didTimeout(), linked.controller.signal.aborted)
      throw normalized.attachCallMetadata({
        providerId: this.provider.id,
        model: 'unknown',
        mode: 'complete',
        startedAt,
        durationMs: elapsed(started),
        timeoutMs: this.timeoutMs,
        timedOut: linked.didTimeout(),
        error: normalized.metadata(),
      })
    } finally {
      linked.cleanup()
    }
  }

  async stream(request: LlmRequest, signal?: AbortSignal): Promise<LlmStreamHandle> {
    const started = performance.now()
    const startedAt = new Date().toISOString()
    const linked = linkedController(signal, this.timeoutMs)
    let providerResult
    try {
      providerResult = await this.provider.stream(request, { signal: linked.controller.signal })
    } catch (error) {
      linked.cleanup()
      const normalized = normalizeError(error, linked.didTimeout(), linked.controller.signal.aborted)
      throw normalized.attachCallMetadata({
        providerId: this.provider.id,
        model: 'unknown',
        mode: 'stream',
        startedAt,
        durationMs: elapsed(started),
        timeoutMs: this.timeoutMs,
        timedOut: linked.didTimeout(),
        error: normalized.metadata(),
      })
    }

    const provider = this.provider
    const timeoutMs = this.timeoutMs
    let resolveMetadata!: (metadata: LlmCallMetadata) => void
    const metadata = new Promise<LlmCallMetadata>(resolve => { resolveMetadata = resolve })
    const reader = providerResult.stream.getReader()
    let usage: LlmCallMetadata['usage']
    let finishReason: LlmCallMetadata['finishReason']
    let requestId = providerResult.requestId
    let metadataResolved = false

    const resolveOnce = (value: LlmCallMetadata) => {
      if (metadataResolved) return
      metadataResolved = true
      resolveMetadata(value)
    }

    const baseMetadata = (): Omit<LlmCallMetadata, 'error'> => ({
      providerId: provider.id,
      model: providerResult.model,
      mode: 'stream',
      startedAt,
      durationMs: elapsed(started),
      timeoutMs,
      timedOut: linked.didTimeout(),
      ...(requestId ? { requestId } : {}),
      ...(finishReason ? { finishReason } : {}),
      ...(usage ? { usage } : {}),
    })

    const stream = new ReadableStream<LlmStreamEvent>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()
          if (done) {
            linked.cleanup()
            resolveOnce(baseMetadata())
            controller.close()
            return
          }
          if (value.type === 'usage') usage = value.usage
          if (value.type === 'done') {
            finishReason = value.finishReason
            usage = value.usage ?? usage
            requestId = value.requestId ?? requestId
          }
          controller.enqueue(value)
        } catch (error) {
          const normalized = normalizeError(error, linked.didTimeout(), linked.controller.signal.aborted)
          linked.cleanup()
          resolveOnce({ ...baseMetadata(), error: normalized.metadata() })
          controller.error(normalized)
        }
      },
      async cancel(reason) {
        linked.controller.abort(reason)
        await reader.cancel(reason)
        linked.cleanup()
        resolveOnce({
          ...baseMetadata(),
          error: new LlmGatewayError('LLM_ABORTED', 'LLM stream was cancelled', true).metadata(),
        })
      },
    })
    return { stream, metadata }
  }
}

export async function collectLlmStream(handle: LlmStreamHandle): Promise<CollectedLlmStream> {
  const reader = handle.stream.getReader()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value.type === 'delta') text += value.text
  }
  return { text, metadata: await handle.metadata }
}
