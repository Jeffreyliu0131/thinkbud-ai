import { describe, expect, it, vi } from 'vitest'
import { collectLlmStream, LlmGateway } from '../_shared/llm/gateway'
import { ArkLlmProvider, serializeArkMessages } from '../_shared/providers/chat/ark'

const request = {
  systemPrompt: 'server-owned system policy',
  messages: [{ role: 'user' as const, content: 'learner question' }],
  untrustedContexts: [{
    id: 'textbook-rag-v1',
    label: 'textbook_retrieval',
    trust: 'untrusted' as const,
    content: 'wrapped excerpt',
  }],
}

describe('Ark LLM adapter', () => {
  it('serializes RAG context as a user data field, never a system role', () => {
    const messages = serializeArkMessages(request)

    expect(messages.filter(message => message.role === 'system')).toEqual([
      { role: 'system', content: 'server-owned system policy' },
    ])
    expect(messages[1]).toMatchObject({ role: 'user' })
    expect(messages[1].content).toContain('UNTRUSTED_CONTEXT_FIELD')
    expect(messages[1].content).toContain('not learner state')
  })

  it('adapts non-stream Ark responses without exposing credentials in request content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'ark-request-1',
      model: 'ark-test-model',
      choices: [{ message: { content: '先说说已知条件？' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
    }), { status: 200 }))
    const provider = new ArkLlmProvider(
      { ARK_API_KEY: 'server-secret', ARK_MODEL_ID: 'ark-test-model' },
      { fetchImplementation: fetchMock },
    )
    const result = await new LlmGateway(provider).complete(request)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = String(init.body)

    expect(result.text).toBe('先说说已知条件？')
    expect(result.metadata.usage?.totalTokens).toBe(28)
    expect(body).not.toContain('server-secret')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer server-secret')
  })

  it('adapts Ark SSE deltas and usage into the gateway stream contract', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"先看"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"条件？"},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'x-request-id': 'ark-stream-1' },
    }))
    const provider = new ArkLlmProvider(
      { ARK_API_KEY: 'server-secret', ARK_MODEL_ID: 'ark-test-model' },
      { fetchImplementation: fetchMock },
    )
    const result = await collectLlmStream(await new LlmGateway(provider).stream(request))

    expect(result.text).toBe('先看条件？')
    expect(result.metadata.requestId).toBe('ark-stream-1')
    expect(result.metadata.usage?.totalTokens).toBe(6)
    expect(result.metadata.finishReason).toBe('stop')
  })

  it('fails clearly when server-side Ark configuration is missing', async () => {
    const provider = new ArkLlmProvider({}, { fetchImplementation: vi.fn() })

    await expect(new LlmGateway(provider).complete(request)).rejects.toMatchObject({
      code: 'LLM_CONFIGURATION',
      retryable: false,
    })
  })
})
