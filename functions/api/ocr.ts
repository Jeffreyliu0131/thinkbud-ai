// Cloudflare Pages Function: 火山引擎 OCR 代理
// 正式方案：火山引擎视觉智能 OCRNormal（V4 签名 + AK/SK）
// 兜底方案：如配置了 ARK_VISION_MODEL_ID 且正式方案失败，回退到方舟视觉模型
// 前端协议不变：POST { image: base64 } → { text }

import { recognizeWithVolcOCR, recognizeWithVisionModel } from '../_shared/providers/ocr/ocr'
import { jsonResponse, errorResponse } from '../_shared/utils/response'
import { checkUserRateLimit } from '../_shared/rate-limit'
import type { AppEnv, ContextData } from '../_shared/env'

export const onRequestPost: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const { image } = await context.request.json() as { image?: string }

    if (!image) {
      return errorResponse('缺少图片数据', 400)
    }

    if (typeof image !== 'string' || image.length > 6_000_000) {
      return errorResponse('图片数据过大', 400)
    }

    // Per-user 限流（STAB-05: 每分钟 5 次 ocr）
    const userId = context.data?.userId
    if (userId && context.env.DB) {
      const rateCheck = await checkUserRateLimit(context.env.DB, userId, 'ocr', 5, 1)
      if (!rateCheck.allowed) {
        return errorResponse('请求过于频繁，请稍后再试', 429)
      }
    }

    const env = context.env

    // 优先使用火山 OCR 正式方案
    const hasVolcOCR = env.VOLC_ACCESS_KEY_ID && env.VOLC_SECRET_ACCESS_KEY
    if (hasVolcOCR) {
      try {
        const text = await recognizeWithVolcOCR(env, { imageBase64: image })
        return jsonResponse({ text })
      } catch (volcErr) {
        console.error('[OCR] 火山 OCR 失败:', volcErr instanceof Error ? volcErr.message : volcErr)
        console.error('[OCR] 火山 OCR stack:', volcErr instanceof Error ? volcErr.stack : 'no stack')
        // 如果有视觉模型配置，回退
        if (env.ARK_API_KEY && env.ARK_VISION_MODEL_ID) {
          const text = await recognizeWithVisionModel(env, { imageBase64: image })
          return jsonResponse({ text })
        }
        throw volcErr
      }
    }

    // 没有火山 OCR 配置，直接用视觉模型（临时方案）
    if (env.ARK_API_KEY && env.ARK_VISION_MODEL_ID) {
      // ⚠️ 临时方案：使用方舟视觉模型做 OCR，非标准 OCR 引擎
      console.warn('[OCR] 使用方舟视觉模型临时方案（火山 OCR 未配置）')
      const text = await recognizeWithVisionModel(env, { imageBase64: image })
      return jsonResponse({ text })
    }

    return errorResponse('OCR 服务未配置（需要 VOLC_ACCESS_KEY_ID/SK 或 ARK_API_KEY + ARK_VISION_MODEL_ID）', 500)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR 处理失败'
    console.error('[OCR] 最终错误:', message)
    console.error('[OCR] 错误 stack:', err instanceof Error ? err.stack : 'no stack')
    return errorResponse(message)
  }
}
