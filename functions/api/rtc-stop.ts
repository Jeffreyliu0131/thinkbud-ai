// Cloudflare Pages Function: 停止 RTC Voice Chat 任务
// 调用火山引擎 StopVoiceChat API，防止幽灵任务消耗 LLM token
// POST { roomId, taskId } → { success }

import { signRequest } from '../_shared/providers/rtc/sign'
import { jsonResponse, errorResponse } from '../_shared/utils/response'
import { getEnvVar } from '../_shared/env'
import type { AppEnv } from '../_shared/env'

const RTC_API_HOST = 'https://rtc.volcengineapi.com'
const ACTION = 'StopVoiceChat'
const VERSION = '2024-12-01'

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  try {
    const { roomId, taskId } = await context.request.json() as {
      roomId?: string
      taskId?: string
    }

    if (!roomId || !taskId) {
      return errorResponse('缺少必要参数', 400)
    }

    const env = context.env
    const rtcAppId = getEnvVar(env, 'RTC_APP_ID')
    const accessKeyId = getEnvVar(env, 'VOLC_ACCESS_KEY_ID')
    const secretAccessKey = getEnvVar(env, 'VOLC_SECRET_ACCESS_KEY')

    const body = JSON.stringify({
      AppId: rtcAppId,
      RoomId: roomId,
      TaskId: taskId,
    })

    const url = `${RTC_API_HOST}?Action=${ACTION}&Version=${VERSION}`

    const headers = await signRequest({
      method: 'POST',
      url,
      body,
      accessKeyId,
      secretAccessKey,
      service: 'rtc',
      region: 'cn-north-1',
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const result = await res.json() as {
      ResponseMetadata?: { Error?: { Code: string; Message: string } }
    }

    if (!res.ok || result.ResponseMetadata?.Error) {
      const errCode = result.ResponseMetadata?.Error?.Code || ''
      const errMsg = result.ResponseMetadata?.Error?.Message || `HTTP ${res.status}`
      console.error('[RTC Stop] API error:', { errCode, errMsg })
      // 不抛错，因为任务可能已自然结束
    }

    console.log('[RTC Stop] 成功', { roomId, taskId })
    return jsonResponse({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '停止语音对话失败'
    console.error('[RTC Stop]', message)
    // 返回 success，因为 stop 失败不应阻塞客户端
    return jsonResponse({ success: true })
  }
}
