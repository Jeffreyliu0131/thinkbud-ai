// Cloudflare Pages Function: RTC Token 生成
// 前端请求时生成临时 token，用于加入 RTC 房间
// POST { roomId, userId } → { token, appId }

import { generateRTCToken } from '../_shared/providers/rtc/token'
import { jsonResponse, errorResponse } from '../_shared/utils/response'
import { getEnvVar } from '../_shared/env'
import type { AppEnv, ContextData } from '../_shared/env'

export const onRequestPost: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const authenticatedUserId = context.data.userId
    if (!authenticatedUserId) {
      return errorResponse('未登录', 401)
    }

    const { roomId, userId } = await context.request.json() as {
      roomId?: string
      userId?: string
    }

    if (!roomId || !userId) {
      return errorResponse('缺少 roomId 或 userId', 400)
    }

    if (userId !== authenticatedUserId) {
      return errorResponse('无权为其他用户生成 Token', 403)
    }

    const env = context.env
    const appId = getEnvVar(env, 'RTC_APP_ID')
    const appKey = getEnvVar(env, 'RTC_APP_KEY')

    const token = await generateRTCToken({
      appId,
      appKey,
      roomId,
      userId,
      expireSeconds: 86400, // 24h
    })

    return jsonResponse({ token, appId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token 生成失败'
    console.error('[RTC Token]', message)
    return errorResponse(message)
  }
}
