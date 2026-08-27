import { describe, expect, it } from 'vitest'
import { FakeLlmProvider } from '../_shared/llm/fake'
import { collectLlmStream, LlmGateway, LlmGatewayError } from '../_shared/llm/gateway'

const request = {
  systemPrompt: 'Guide thinking without revealing the answer.',
  messages: [{ role: 'user' as const, content: 'How should I begin?' }],
  untrustedContexts: [{
    id: 'textbook-rag-v1',
    label: 'textbook_retrieval',
    trust: 'untrusted' as const,
    content: '[UNTRUSTED_TEXTBOOK] synthetic excerpt',
  }],
}

describe('provider-agnostic LLM gateway', () => {
  it('returns completion usage, finish, request, provider, and timeout metadata', async () => {
    const provider = new FakeLlmProvider({
      response: 'Which condition do you know first?',
      usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
    })
    const result = await new LlmGateway(provider, { timeoutMs: 500 }).complete(request)

    expect(result.text).toContain('condition')
    expect(result.metadata).toMatchObject({
      providerId: 'fake-llm',
      model: 'fake-model-v1',
      mode: 'complete',
      timeoutMs: 500,
      timedOut: false,
      finishReason: 'stop',
      usage: { totalTokens: 19 },
    })
    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0)
    expect(provider.calls[0].untrustedContexts?.[0].trust).toBe('untrusted')
  })

  it('collects typed stream deltas and final usage metadata', async () => {
    const provider = new FakeLlmProvider({
      chunks: ['Which ', 'condition?'],
      usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
    })
    const collected = await collectLlmStream(await new LlmGateway(provider).stream(request))

    expect(collected.text).toBe('Which condition?')
    expect(collected.metadata.mode).toBe('stream')
    expect(collected.metadata.usage?.totalTokens).toBe(13)
    expect(collected.metadata.finishReason).toBe('stop')
  })

  it('normalizes timeout into explicit retryable metadata', async () => {
    const provider = new FakeLlmProvider({ delayMs: 30 })
    const gateway = new LlmGateway(provider, { timeoutMs: 5 })

    await expect(gateway.complete(request)).rejects.toMatchObject({
      code: 'LLM_TIMEOUT',
      retryable: true,
      callMetadata: {
        providerId: 'fake-llm',
        mode: 'complete',
        timeoutMs: 5,
        timedOut: true,
      },
    })
  })

  it('preserves structured provider errors', async () => {
    const provider = new FakeLlmProvider({
      error: new LlmGatewayError('LLM_HTTP', 'synthetic 503', true, 503),
    })

    await expect(new LlmGateway(provider).complete(request)).rejects.toMatchObject({
      code: 'LLM_HTTP',
      status: 503,
      retryable: true,
    })
  })
})
