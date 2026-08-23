// POST /api/auth/verify — 验证码校验 + 登录/注册
import type { AppEnv } from '../../_shared/env'
import { hashPhone, findUserByPhone, signJwt, setCookieHeader } from '../../_shared/auth'
import { verifyCode, createUser } from '../../_shared/db'
import { errorResponse } from '../../_shared/utils/response'
import { checkIpRateLimit, getClientIp } from '../../_shared/rate-limit'

interface VerifyRequest {
  phone: string
  code: string
  nickname?: string
  grade?: number
}

const USER_JWT_TTL = 30 * 24 * 60 * 60 // 30 天

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  try {
    const { phone, code, nickname, grade }: VerifyRequest = await context.request.json()

    if (!phone || !code) {
      return errorResponse('参数不完整', 400)
    }

    // IP 级别限流（5次/分钟）
    const ip = getClientIp(context.request)
    const ipCheck = await checkIpRateLimit(context.env.DB, ip, 'verify', 5, 1)
    if (!ipCheck.allowed) {
      return errorResponse('请求过于频繁，请稍后再试', 429)
    }

    const phoneHash = await hashPhone(phone, context.env.PHONE_HASH_SECRET)

    // 验证码校验（所有模式都必须验证，测试码已删除）
    const result = await verifyCode(context.env.DB, phoneHash, code)
    if (!result.valid) {
      return errorResponse(result.reason!, 400)
    }

    // 查找或创建用户（dual-lookup: HMAC first, legacy fallback with auto-migrate）
    let user = await findUserByPhone(context.env.DB, phone, context.env.PHONE_HASH_SECRET)
    const isNewUser = !user

    if (!user) {
      const userId = crypto.randomUUID()
      const maskedPhone = `****${phone.slice(-4)}`
      await createUser(context.env.DB, userId, maskedPhone, phoneHash)
      user = await findUserByPhone(context.env.DB, phone, context.env.PHONE_HASH_SECRET)
    }

    if (!user) {
      return errorResponse('创建用户失败', 500)
    }

    // 新用户设置昵称和年级
    if (isNewUser && nickname && grade) {
      await context.env.DB.prepare(
        `UPDATE users SET nickname = ?, grade = ? WHERE id = ?`
      ).bind(nickname, grade, user.id).run()
    }

    // 签发 JWT
    const token = await signJwt(user.id, 'user', context.env.JWT_SECRET, USER_JWT_TTL)

    return new Response(JSON.stringify({
      success: true,
      isNewUser,
      user: {
        id: user.id,
        nickname: nickname || user.nickname,
        grade: grade || user.grade,
        onboardingCompleted: !!user.onboarding_completed,
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setCookieHeader('auth_token', token, USER_JWT_TTL, context.request.url),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Verify]', msg, err)
    return errorResponse('验证失败，请重试')
  }
}
