// GET /api/auth/me — 获取当前用户信息
// 需要认证：middleware 验证 auth_token cookie 并注入 context.data.userId
import type { AppEnv, ContextData } from '../../_shared/env'
import { jsonResponse, errorResponse } from '../../_shared/utils/response'

export const onRequestGet: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const userId = context.data.userId
    if (!userId) {
      return errorResponse('未登录', 401)
    }

    const user = await context.env.DB.prepare(
      `SELECT id, phone, nickname, grade, onboarding_completed, created_at, last_active_at FROM users WHERE id = ?`
    ).bind(userId).first()

    if (!user) {
      return errorResponse('用户不存在', 404)
    }

    return jsonResponse({ user })
  } catch (err) {
    console.error('[Me]', err)
    return errorResponse('获取用户信息失败')
  }
}
