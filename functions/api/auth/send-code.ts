// POST /api/auth/send-code — 发送短信验证码
import type { AppEnv } from '../../_shared/env'
import { hashPhone, generateCode } from '../../_shared/auth'
import { checkSendRateLimit, saveVerificationCode } from '../../_shared/db'
import { createSmsProvider } from '../../_shared/providers/sms/sms'
import { jsonResponse, errorResponse } from '../../_shared/utils/response'
import { checkIpRateLimit, getClientIp } from '../../_shared/rate-limit'

interface SendCodeRequest {
  phone: string
}

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  try {
    const { phone }: SendCodeRequest = await context.request.json()

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return errorResponse('请输入正确的手机号', 400)
    }

    // IP 级别限流（5次/分钟）
    const ip = getClientIp(context.request)
    const ipCheck = await checkIpRateLimit(context.env.DB, ip, 'send-code', 5, 1)
    if (!ipCheck.allowed) {
      return errorResponse('请求过于频繁，请稍后再试', 429)
    }

    const phoneHash = await hashPhone(phone, context.env.PHONE_HASH_SECRET)

    // 手机号级别限流检查
    const rateCheck = await checkSendRateLimit(context.env.DB, phoneHash)
    if (!rateCheck.allowed) {
      return errorResponse(rateCheck.reason!, 429)
    }

    // 生成验证码
    const code = generateCode()

    // 存到 D1
    await saveVerificationCode(context.env.DB, phoneHash, code)

    // 发送短信（invite 模式下仅打印到控制台）
    const authMode = context.env.AUTH_MODE || 'invite'
    const smsProvider = createSmsProvider(context.env)
    await smsProvider.sendCode(phone, code)

    // invite 模式：验证码直接返回给前端（无 SMS 服务时唯一获取方式）
    // sms 模式：不返回验证码（通过短信发送）
    if (authMode === 'invite') {
      return jsonResponse({ success: true, message: '验证码已发送', code })
    }
    return jsonResponse({ success: true, message: '验证码已发送' })
  } catch (err) {
    console.error('[SendCode]', err)
    return errorResponse('发送验证码失败，请稍后重试')
  }
}
