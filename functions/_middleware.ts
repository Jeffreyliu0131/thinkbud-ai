// Cloudflare Pages Functions Middleware
// 统一认证：检查 JWT cookie，注入 userId 到 context.data
// 安全头：CSP + X-Content-Type-Options + X-Frame-Options (SEC-05)

import type { AppEnv, ContextData } from './_shared/env'
import { verifyJwt, parseCookies } from './_shared/auth'
import { logError } from './_shared/error-log'

// 白名单：不需要认证的路由（精确匹配，不用前缀）
const PUBLIC_PATHS = [
  '/api/auth/send-code',  // 发送验证码
  '/api/auth/verify',     // 验证码校验 + 登录
  '/api/auth/logout',     // 登出（清 cookie，token 过期也要能调）
  '/api/error-report',    // 客户端错误上报（无需认证）
]

// Admin 路由：使用单独的 admin_token cookie
const ADMIN_PREFIX = '/api/admin/'

// ===== Security Headers (SEC-05) =====

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' data: https://ark.cn-beijing.volces.com https://rtc.volcengineapi.com https://visual.volcengineapi.com wss://*.volcengineapi.com https://*.rtc.volcvideo.com https://*.volcvideos.com wss://*.rtc.volcvideo.com wss://*.volcvideos.com",
  "worker-src 'self' blob:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'"
].join('; ')

function addSecurityHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response)
  newResponse.headers.set('Content-Security-Policy', CSP_POLICY)
  newResponse.headers.set('X-Content-Type-Options', 'nosniff')
  newResponse.headers.set('X-Frame-Options', 'DENY')
  return newResponse
}

function jsonError(message: string, status: number): Response {
  return addSecurityHeaders(
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

// ===== Middleware =====

export const onRequest: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  const url = new URL(context.request.url)
  const path = url.pathname

  // 只处理 /api/ 路由
  if (!path.startsWith('/api/')) {
    const response = await context.next()
    return addSecurityHeaders(response)
  }

  // 白名单路由直接放行
  if (PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'))) {
    const response = await context.next()
    return addSecurityHeaders(response)
  }

  const cookies = parseCookies(context.request.headers.get('Cookie'))
  const jwtSecret = context.env.JWT_SECRET

  if (!jwtSecret) {
    console.error('[Middleware] JWT_SECRET 未配置')
    return jsonError('服务配置错误', 500)
  }

  // Admin 路由：检查 admin_token
  if (path.startsWith(ADMIN_PREFIX)) {
    // admin/login 也需要放行（用来获取 admin_token）
    if (path === '/api/admin/login') {
      const response = await context.next()
      return addSecurityHeaders(response)
    }

    const adminToken = cookies['admin_token']
    if (!adminToken) {
      return jsonError('请先登录管理后台', 401)
    }

    const payload = await verifyJwt(adminToken, jwtSecret)
    if (!payload || payload.role !== 'admin') {
      return jsonError('管理员凭证无效或已过期', 401)
    }

    context.data.isAdmin = true
    try {
      const response = await context.next()
      return addSecurityHeaders(response)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      context.waitUntil(
        logError(context.env.DB, 'server', error.message, {
          path: url.pathname,
          stack: error.stack,
        })
      )
      throw err
    }
  }

  // 普通用户路由：检查 auth_token
  const authToken = cookies['auth_token']
  if (!authToken) {
    return jsonError('请先登录', 401)
  }

  const payload = await verifyJwt(authToken, jwtSecret)
  if (!payload || payload.role !== 'user') {
    return jsonError('登录已过期，请重新登录', 401)
  }

  context.data.userId = payload.sub
  try {
    const response = await context.next()
    return addSecurityHeaders(response)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    context.waitUntil(
      logError(context.env.DB, 'server', error.message, {
        path: url.pathname,
        stack: error.stack,
        userId: context.data.userId,
      })
    )
    throw err
  }
}
