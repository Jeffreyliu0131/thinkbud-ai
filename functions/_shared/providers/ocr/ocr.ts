// 火山引擎 OCR Provider
// 正式方案：火山引擎通用 OCR (OCRNormal)
// 过渡方案：火山方舟视觉模型 (标注为临时方案)
// 两种方案对外统一返回 { text: string }

import { getEnvVar } from '../../env'
import { signRequest } from './volcengine-sign'

// ===== 正式方案：火山引擎视觉智能 OCR =====

const OCR_HOST = 'visual.volcengineapi.com'
const OCR_SERVICE = 'cv'
const OCR_REGION = 'cn-north-1'

interface OCRRequest {
  /** base64 编码的图片 */
  imageBase64: string
}

/**
 * 正式方案：调用火山引擎 OCR
 * 使用 V4 签名 + AK/SK 认证
 */
export async function recognizeWithVolcOCR(
  env: Record<string, string | undefined>,
  request: OCRRequest
): Promise<string> {
  const accessKeyId = getEnvVar(env, 'VOLC_ACCESS_KEY_ID')
  const secretAccessKey = getEnvVar(env, 'VOLC_SECRET_ACCESS_KEY')

  const body = JSON.stringify({
    image_base64: request.imageBase64,
  })

  const now = new Date()

  const signed = await signRequest({
    method: 'POST',
    path: '/',
    query: {
      Action: 'OCRNormal',
      Version: '2020-08-26',
    },
    headers: {
      'Host': OCR_HOST,
      'Content-Type': 'application/json',
    },
    body,
    accessKeyId,
    secretAccessKey,
    service: OCR_SERVICE,
    region: OCR_REGION,
    date: now,
  })

  console.log('[OCR] 请求 URL:', signed.url)
  console.log('[OCR] 请求头 (不含密钥):', {
    'Content-Type': signed.headers['Content-Type'],
    'Host': signed.headers['Host'],
    'X-Date': signed.headers['X-Date'],
    'Authorization': signed.headers['Authorization']?.slice(0, 80) + '...',
  })
  console.log('[OCR] Body 长度:', signed.body.length)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)

  const res = await fetch(signed.url, {
    method: 'POST',
    headers: signed.headers,
    body: signed.body,
    signal: controller.signal,
  })
  clearTimeout(timeout)

  console.log('[OCR] 响应状态:', res.status, res.statusText)

  if (!res.ok) {
    const errText = await res.text()
    console.error('[OCR] 错误响应体:', errText.slice(0, 500))
    throw new Error(`火山 OCR 请求失败 (${res.status}): ${errText}`)
  }

  const result = await res.json() as {
    code?: number
    message?: string
    data?: {
      line_texts?: string[]
    }
  }

  console.log('[OCR] 响应结果:', JSON.stringify({ code: result.code, message: result.message, lineCount: result.data?.line_texts?.length }))

  if (result.code && result.code !== 10000) {
    throw new Error(`火山 OCR 错误 (${result.code}): ${result.message}`)
  }

  return result.data?.line_texts?.join('\n') || ''
}

// ===== 过渡方案（临时）：火山方舟视觉模型 OCR =====
// ⚠️ 临时方案：使用方舟多模态模型做图片文字提取
// 仅在正式 OCR 方案不可用时启用

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

/**
 * 过渡方案（临时）：使用方舟视觉模型识别图片中的文字
 * ⚠️ 本质是多模态理解，非标准 OCR，手写数学题识别效果可能不如专业 OCR
 */
export async function recognizeWithVisionModel(
  env: Record<string, string | undefined>,
  request: OCRRequest
): Promise<string> {
  const apiKey = getEnvVar(env, 'ARK_API_KEY')
  const modelId = getEnvVar(env, 'ARK_VISION_MODEL_ID')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)

  const res = await fetch(`${ARK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请识别这张图片中的所有文字和数学公式，只输出识别结果，不要解释或解答。保持原始排版格式。',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${request.imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.1, // 低温度保证识别准确性
    }),
  })
  clearTimeout(timeout)

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`方舟视觉 OCR 请求失败 (${res.status}): ${errText}`)
  }

  const result = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }

  return result.choices?.[0]?.message?.content?.trim() || ''
}
