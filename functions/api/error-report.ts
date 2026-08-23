// 客户端错误上报端点（公开，不需要认证）
// 接收前端 unhandled errors 并写入 D1

import type { AppEnv } from '../_shared/env'
import { logError } from '../_shared/error-log'
import { checkIpRateLimit, getClientIp } from '../_shared/rate-limit'

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  try {
    // IP 级别限流：每分钟最多 10 条错误上报
    const ip = getClientIp(context.request)
    const rateCheck = await checkIpRateLimit(context.env.DB, ip, 'error-report', 10, 1)
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({ error: 'rate limited' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await context.request.json() as {
      message: string
      stack?: string
      path?: string
      meta?: Record<string, unknown>
    }

    if (!body.message || typeof body.message !== 'string') {
      return new Response(JSON.stringify({ error: 'missing message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const userId = (context.data as Record<string, unknown>)?.userId as string | undefined

    context.waitUntil(
      logError(context.env.DB, 'client', body.message, {
        path: body.path,
        stack: body.stack,
        meta: body.meta,
        userId: userId ?? undefined,
      })
    )

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'invalid body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
