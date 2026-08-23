// POST /api/auth/onboarding — 标记新手引导已完成
import type { AppEnv, ContextData } from '../../_shared/env'
import { markOnboardingComplete } from '../../_shared/db'
import { jsonResponse, errorResponse } from '../../_shared/utils/response'

export const onRequestPost: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const userId = context.data.userId
    if (!userId) return errorResponse('未登录', 401)

    await markOnboardingComplete(context.env.DB, userId)
    return jsonResponse({ success: true })
  } catch (err) {
    console.error('[Onboarding]', err)
    return errorResponse('标记失败')
  }
}
