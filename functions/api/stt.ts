// Cloudflare Pages Function: 豆包语音识别 (STT) 代理
// 使用豆包大模型录音文件极速版识别，替换百度短语音识别
// 前端协议不变：POST { audio: base64 } → { text }

import { recognizeSpeech } from '../_shared/providers/speech/stt'
import { jsonResponse, errorResponse } from '../_shared/utils/response'
import { checkUserRateLimit } from '../_shared/rate-limit'
import type { AppEnv, ContextData } from '../_shared/env'

export const onRequestPost: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const { audio } = await context.request.json() as { audio?: string }

    if (!audio) {
      return errorResponse('缺少音频数据', 400)
    }

    // Per-user 限流（STAB-05: 每分钟 5 次 stt）
    const userId = context.data?.userId
    if (userId && context.env.DB) {
      const rateCheck = await checkUserRateLimit(context.env.DB, userId, 'stt', 5, 1)
      if (!rateCheck.allowed) {
        return errorResponse('请求过于频繁，请稍后再试', 429)
      }
    }

    if (typeof audio !== 'string' || audio.length > 14_000_000) {
      return errorResponse('音频数据过大', 400)
    }

    const result = await recognizeSpeech(
      context.env,
      { audioBase64: audio }
    )

    return jsonResponse({ text: result.text })
  } catch (err) {
    const message = err instanceof Error ? err.message : '语音识别失败'
    console.error('[STT]', message)
    return errorResponse(message)
  }
}
