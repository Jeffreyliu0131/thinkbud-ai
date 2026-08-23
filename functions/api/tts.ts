// Cloudflare Pages Function: 豆包语音合成 (TTS) 代理
// 替换原 Edge TTS 501 占位，使用豆包 TTS HTTP 一次性合成接口
// 前端协议不变：POST { text, rate? } → 音频二进制 (audio/mpeg)

import { synthesizeSpeech } from '../_shared/providers/speech/tts'
import { errorResponse, audioResponse } from '../_shared/utils/response'
import { checkUserRateLimit } from '../_shared/rate-limit'
import type { AppEnv, ContextData } from '../_shared/env'

export const onRequestPost: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const { text, rate } = await context.request.json() as { text?: string; rate?: number }

    if (!text || typeof text !== 'string') {
      return errorResponse('缺少文本', 400)
    }

    // Per-user 限流（STAB-05: 每分钟 5 次 tts）
    const userId = context.data?.userId
    if (userId && context.env.DB) {
      const rateCheck = await checkUserRateLimit(context.env.DB, userId, 'tts', 5, 1)
      if (!rateCheck.allowed) {
        return errorResponse('请求过于频繁，请稍后再试', 429)
      }
    }

    if (text.length > 2000) {
      return errorResponse('文本过长（最大 2000 字符）', 400)
    }

    const audioBuffer = await synthesizeSpeech(
      context.env,
      { text, rate }
    )

    return audioResponse(audioBuffer, 'audio/mpeg')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS 处理失败'
    console.error('[TTS]', message)
    return errorResponse(message)
  }
}
