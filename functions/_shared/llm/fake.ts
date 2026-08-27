import { LlmGatewayError } from './gateway'
import type {
  LlmFinishReason,
  LlmProvider,
  LlmProviderCallOptions,
  LlmProviderCompleteResult,
  LlmProviderStreamResult,
  LlmRequest,
  LlmStreamEvent,
  LlmUsage,
} from './types'

export interface FakeLlmProviderOptions {
  response?: string
  chunks?: string[]
  model?: string
  usage?: LlmUsage
  finishReason?: LlmFinishReason
  delayMs?: number
  error?: LlmGatewayError
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

export class FakeLlmProvider implements LlmProvider {
  readonly id = 'fake-llm'
  readonly calls: LlmRequest[] = []
  private readonly response: string
  private readonly chunks: string[]
  private readonly model: string
  private readonly usage?: LlmUsage
  private readonly finishReason: LlmFinishReason
  private readonly delayMs: number
  private readonly error?: LlmGatewayError

  constructor(options: FakeLlmProviderOptions = {}) {
    this.response = options.response ?? '先说说你已经知道了什么？'
    this.chunks = options.chunks ?? [this.response]
    this.model = options.model ?? 'fake-model-v1'
    this.usage = options.usage
    this.finishReason = options.finishReason ?? 'stop'
    this.delayMs = options.delayMs ?? 0
    this.error = options.error
  }

  async complete(request: LlmRequest, options: LlmProviderCallOptions): Promise<LlmProviderCompleteResult> {
    this.calls.push(structuredClone(request))
    await wait(this.delayMs, options.signal)
    if (this.error) throw this.error
    return {
      text: this.response,
      model: this.model,
      requestId: `fake-${this.calls.length}`,
      finishReason: this.finishReason,
      ...(this.usage ? { usage: this.usage } : {}),
    }
  }

  async stream(request: LlmRequest, options: LlmProviderCallOptions): Promise<LlmProviderStreamResult> {
    this.calls.push(structuredClone(request))
    if (this.error) throw this.error
    const chunks = [...this.chunks]
    const usage = this.usage
    const finishReason = this.finishReason
    const delayMs = this.delayMs
    const requestId = `fake-${this.calls.length}`
    const stream = new ReadableStream<LlmStreamEvent>({
      async start(controller) {
        try {
          for (const text of chunks) {
            await wait(delayMs, options.signal)
            controller.enqueue({ type: 'delta', text })
          }
          if (usage) controller.enqueue({ type: 'usage', usage })
          controller.enqueue({ type: 'done', finishReason, ...(usage ? { usage } : {}), requestId })
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })
    return { stream, model: this.model, requestId }
  }
}
