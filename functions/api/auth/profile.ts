// POST /api/auth/profile — 保存用户资料（JWT 认证）
// 解决注册第3步失败：验证码在第1步已消耗，这里用 JWT 而非验证码
import type { AppEnv, ContextData } from '../../_shared/env'
import { updateUserProfile, markOnboardingComplete } from '../../_shared/db'
import { jsonResponse, errorResponse } from '../../_shared/utils/response'

interface ProfileRequest {
  nickname: string
  grade: number
}

export const onRequestPost: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const userId = context.data.userId
    if (!userId) return errorResponse('未登录', 401)

    const { nickname, grade }: ProfileRequest = await context.request.json()

    if (!nickname || typeof nickname !== 'string' || !nickname.trim()) {
      return errorResponse('请输入昵称', 400)
    }
    if (!grade || typeof grade !== 'number' || grade < 1 || grade > 6) {
      return errorResponse('请选择有效年级', 400)
    }

    await updateUserProfile(context.env.DB, userId, nickname.trim(), grade)
    await markOnboardingComplete(context.env.DB, userId)

    return jsonResponse({
      success: true,
      user: { nickname: nickname.trim(), grade, onboardingCompleted: true },
    })
  } catch (err) {
    console.error('[Profile]', err)
    return errorResponse('保存资料失败')
  }
}
