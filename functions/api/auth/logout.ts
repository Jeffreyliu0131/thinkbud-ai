// POST /api/auth/logout — 登出（清除 cookie）
import type { AppEnv } from '../../_shared/env'
import { clearCookieHeader } from '../../_shared/auth'

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookieHeader('auth_token', context.request.url),
    },
  })
}
