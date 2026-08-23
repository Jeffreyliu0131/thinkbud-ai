// 火山方舟 Chat Provider（OpenAI 兼容）
// 官方文档: https://www.volcengine.com/docs/82379/1399008
// 接口兼容 OpenAI chat/completions

import { getEnvVar } from '../../env'

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequest {
  messages: Message[]
  systemPrompt: string
}

const CHAT_TIMEOUT = 25_000

/**
 * 准备请求参数（共享逻辑）
 */
function prepareRequest(
  env: Record<string, string | undefined>,
  request: ChatRequest
) {
  const apiKey = getEnvVar(env, 'ARK_API_KEY')
  const modelId = getEnvVar(env, 'ARK_MODEL_ID')

  const fullMessages: Message[] = [
    { role: 'system', content: request.systemPrompt },
    ...request.messages,
  ]

  // 超长上下文截断
  const MAX_CHARS = 16000
  const totalChars = fullMessages.reduce((sum, m) => sum + m.content.length, 0)
  if (totalChars > MAX_CHARS) {
    const system = fullMessages.slice(0, 1)
    const head = fullMessages.slice(1, 3)
    const tail = fullMessages.slice(-18)
    const gapMarker: Message = { role: 'user', content: '[...前面的对话已省略...]' }
    fullMessages.length = 0
    fullMessages.push(...system, ...head, gapMarker, ...tail)
  }

  return { apiKey, modelId, fullMessages }
}

/**
 * 非流式调用火山方舟，返回完整文本字符串
 * 用于知识点提取等需要完整 JSON 输出的场景
 */
export async function chatCompletionJSON(
  env: Record<string, string | undefined>,
  request: ChatRequest
): Promise<string> {
  const { apiKey, modelId, fullMessages } = prepareRequest(env, request)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT)

  const res = await fetch(`${ARK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: fullMessages,
      max_tokens: 512,
      stream: false,
      temperature: 0.2,  // 低温度以提高结构化输出稳定性
    }),
    signal: controller.signal,
  })
  clearTimeout(timeout)

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`方舟 API 错误 (${res.status}): ${errorText}`)
  }

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('方舟 API 返回空内容')
  return content
}

/**
 * 流式调用火山方舟，返回 ReadableStream（SSE 格式）
 * 每个 chunk: data: {"d":"文本片段"}\n\n
 * 结束: data: [DONE]\n\n
 */
export async function chatCompletionStream(
  env: Record<string, string | undefined>,
  request: ChatRequest
): Promise<ReadableStream<Uint8Array>> {
  const { apiKey, modelId, fullMessages } = prepareRequest(env, request)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT)

  const res = await fetch(`${ARK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: fullMessages,
      max_tokens: 1024,
      stream: true,
      temperature: 0.7,
      thinking: { type: 'disabled' },
    }),
    signal: controller.signal,
  })
  clearTimeout(timeout)

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`方舟 API 错误 (${res.status}): ${errorText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('无法读取方舟响应')
  }

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(ctrl) {
      let lineBuffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const text = lineBuffer + chunk
          const lines = text.split('\n')
          lineBuffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            try {
              const event = JSON.parse(data)
              const delta = event.choices?.[0]?.delta?.content
              if (delta) {
                ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ d: delta })}\n\n`))
              }
            } catch { /* skip malformed chunks */ }
          }
        }

        // 处理最后残余 buffer
        if (lineBuffer.startsWith('data: ')) {
          const data = lineBuffer.slice(6).trim()
          if (data && data !== '[DONE]') {
            try {
              const event = JSON.parse(data)
              const delta = event.choices?.[0]?.delta?.content
              if (delta) {
                ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ d: delta })}\n\n`))
              }
            } catch { /* skip */ }
          }
        }

        ctrl.enqueue(encoder.encode('data: [DONE]\n\n'))
        ctrl.close()
      } catch (err) {
        ctrl.error(err)
      }
    },
  })
}
