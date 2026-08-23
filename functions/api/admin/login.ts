// POST /api/admin/login — 管理后台密码登录
import type { AppEnv } from '../../_shared/env'
import { constantTimeCompare, signJwt, setCookieHeader, hashPhone } from '../../_shared/auth'
import { checkAdminRateLimit, recordAdminAttempt } from '../../_shared/db'
import { errorResponse } from '../../_shared/utils/response'

const ADMIN_JWT_TTL = 7 * 24 * 60 * 60 // 7 天

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  try {
    const { password }: { password: string } = await context.request.json()

    if (!password) {
      return errorResponse('请输入密码', 400)
    }

    // IP hash 用于限流
    const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
    const ipHash = await hashPhone(ip, context.env.PHONE_HASH_SECRET) // 复用 hashPhone 做 IP hash

    // 限流检查
    const rateCheck = await checkAdminRateLimit(context.env.DB, ipHash)
    if (!rateCheck.allowed) {
      return errorResponse(`尝试次数过多，请10分钟后再试`, 429)
    }

    // 密码比对
    const isCorrect = await constantTimeCompare(password, context.env.ADMIN_PASSWORD)

    // 记录尝试
    await recordAdminAttempt(context.env.DB, ipHash, isCorrect)

    if (!isCorrect) {
      return errorResponse(`密码错误（剩余${rateCheck.remaining - 1}次）`, 401)
    }

    // 签发 admin JWT
    const token = await signJwt('admin', 'admin', context.env.JWT_SECRET, ADMIN_JWT_TTL)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setCookieHeader('admin_token', token, ADMIN_JWT_TTL, context.request.url),
      },
    })
  } catch (err) {
    console.error('[AdminLogin]', err)
    return errorResponse('登录失败')
  }
}
