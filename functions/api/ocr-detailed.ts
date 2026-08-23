// Cloudflare Pages Function: OCR 完整数据端点（含 bbox）
// 复用火山引擎 OCRNormal，但返回完整 data 对象（不只是 line_texts）
// 用于白板 spike 验证 bbox 数据可用性

import { signRequest } from '../_shared/providers/ocr/volcengine-sign'
import { recognizeWithVisionModel } from '../_shared/providers/ocr/ocr'
import { getEnvVar } from '../_shared/env'
import { jsonResponse, errorResponse } from '../_shared/utils/response'
import { checkUserRateLimit } from '../_shared/rate-limit'
import type { AppEnv, ContextData } from '../_shared/env'

const OCR_HOST = 'visual.volcengineapi.com'
const OCR_SERVICE = 'cv'
const OCR_REGION = 'cn-north-1'

export const onRequestPost: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const { image } = await context.request.json() as { image?: string }

    if (!image) {
      return errorResponse('缺少图片数据', 400)
    }

    if (typeof image !== 'string' || image.length > 6_000_000) {
      return errorResponse('图片数据过大', 400)
    }

    // Per-user 限流（每分钟 5 次 ocr）
    const userId = context.data?.userId
    if (userId && context.env.DB) {
      const rateCheck = await checkUserRateLimit(context.env.DB, userId, 'ocr', 5, 1)
      if (!rateCheck.allowed) {
        return errorResponse('请求过于频繁，请稍后再试', 429)
      }
    }

    const env = context.env
    const hasVolcOCR = env.VOLC_ACCESS_KEY_ID && env.VOLC_SECRET_ACCESS_KEY

    // 如果没有火山 OCR 配置，直接走 Vision 兜底
    if (!hasVolcOCR) {
      console.warn('[OCR-DETAILED] 火山 OCR 未配置，使用 Vision 兜底')
      if (env.ARK_API_KEY && env.ARK_VISION_MODEL_ID) {
        const text = await recognizeWithVisionModel(env, { imageBase64: image })
        return jsonResponse({
          line_texts: text.split('\n').filter(Boolean),
          line_rects: [],
          chars: [],
          polygons: [],
          raw_keys: ['vision_fallback'],
          request_id: '',
          _note: 'Vision model fallback — no bbox data available',
        })
      }
      return errorResponse('OCR 服务未配置', 500)
    }

    const accessKeyId = getEnvVar(env, 'VOLC_ACCESS_KEY_ID')
    const secretAccessKey = getEnvVar(env, 'VOLC_SECRET_ACCESS_KEY')

    const body = JSON.stringify({
      image_base64: image,
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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)

    const res = await fetch(signed.url, {
      method: 'POST',
      headers: signed.headers,
      body: signed.body,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const errText = await res.text()
      console.error('[OCR-DETAILED] 火山 OCR 失败:', errText.slice(0, 500))
      // 兜底到 Vision 模型
      if (env.ARK_API_KEY && env.ARK_VISION_MODEL_ID) {
        console.warn('[OCR-DETAILED] 回退到 Vision 兜底')
        const text = await recognizeWithVisionModel(env, { imageBase64: image })
        return jsonResponse({
          line_texts: text.split('\n').filter(Boolean),
          line_rects: [],
          chars: [],
          polygons: [],
          raw_keys: ['vision_fallback'],
          request_id: '',
          _note: `Vision model fallback — Volc OCR failed (${res.status})`,
        })
      }
      throw new Error(`火山 OCR 请求失败 (${res.status}): ${errText}`)
    }

    const result = await res.json() as {
      code?: number
      message?: string
      request_id?: string
      data?: Record<string, unknown>
    }

    if (result.code && result.code !== 10000) {
      throw new Error(`火山 OCR 错误 (${result.code}): ${result.message}`)
    }

    const data = result.data || {}

    // 返回完整数据 + raw_keys 用于调试
    return jsonResponse({
      line_texts: data.line_texts || [],
      line_rects: data.line_rects || [],
      chars: data.chars || [],
      polygons: data.polygons || [],
      raw_keys: Object.keys(data),
      request_id: result.request_id || '',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR 处理失败'
    console.error('[OCR-DETAILED] 最终错误:', message)
    console.error('[OCR-DETAILED] 错误 stack:', err instanceof Error ? err.stack : 'no stack')
    return errorResponse(message)
  }
}
