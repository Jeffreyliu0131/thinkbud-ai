import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signJwt } from '../_shared/auth'

// ── Mock next() 和 context ──────────────────────────────────────

const JWT_SECRET = 'test-secret-key-for-middleware'

function createMockRequest(
  path: string,
  cookies?: Record<string, string>,
): Request {
  const headers = new Headers()
  if (cookies) {
    const cookieStr = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
    headers.set('Cookie', cookieStr)
  }
  return new Request(`https://app.example.com${path}`, { headers })
}

interface MockContext {
  request: Request
  env: { JWT_SECRET: string }
  data: Record<string, unknown>
  next: ReturnType<typeof vi.fn>
}

function createMockContext(request: Request): MockContext {
  return {
    request,
    env: { JWT_SECRET },
    data: {},
    next: vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  }
}

// ── 动态导入中间件（需要在模块级别加载） ──────────────────────

// 因为 _middleware.ts 引用了 PagesFunction 类型（Cloudflare Workers 全局类型），
// 我们需要给 global 定义这个类型
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PagesFunction<Env = unknown, Params extends string = string, Data extends Record<string, unknown> = Record<string, unknown>> = (
  context: { request: Request; env: Env; data: Data; next: () => Promise<Response> }
) => Promise<Response> | Response

// 将 PagesFunction 注入全局以便中间件模块加载
;(globalThis as Record<string, unknown>).PagesFunction = undefined

import { onRequest } from '../_middleware'

// ── 辅助：执行中间件 ──────────────────────────────────────

async function runMiddleware(ctx: MockContext): Promise<Response> {
  // onRequest 是一个 PagesFunction
  return (onRequest as unknown as PagesFunction<typeof ctx.env, string, typeof ctx.data>)(ctx)
}

// ── 测试 ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('认证中间件', () => {
  describe('PUBLIC_PATHS 白名单', () => {
    it('/api/auth/send-code 无需认证', async () => {
      const request = createMockRequest('/api/auth/send-code')
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(ctx.next).toHaveBeenCalled()
      expect(response.status).toBe(200)
    })

    it('/api/auth/verify 无需认证', async () => {
      const request = createMockRequest('/api/auth/verify')
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(ctx.next).toHaveBeenCalled()
      expect(response.status).toBe(200)
    })

    it('/api/auth/logout 无需认证', async () => {
      const request = createMockRequest('/api/auth/logout')
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(ctx.next).toHaveBeenCalled()
      expect(response.status).toBe(200)
    })
  })

  describe('受保护路由', () => {
    it('/api/chat 无 cookie 返回 401', async () => {
      const request = createMockRequest('/api/chat')
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(response.status).toBe(401)
      const body = await response.json() as { error: string }
      expect(body.error).toBeTruthy()
      expect(ctx.next).not.toHaveBeenCalled()
    })

    it('/api/chat 有效 JWT 通过认证并注入 userId', async () => {
      const token = await signJwt('user-123', 'user', JWT_SECRET, 3600)
      const request = createMockRequest('/api/chat', { auth_token: token })
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(response.status).toBe(200)
      expect(ctx.next).toHaveBeenCalled()
      expect(ctx.data.userId).toBe('user-123')
    })

    it('过期/无效 JWT 返回 401', async () => {
      const request = createMockRequest('/api/chat', { auth_token: 'invalid.jwt.token' })
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(response.status).toBe(401)
      expect(ctx.next).not.toHaveBeenCalled()
    })
  })

  describe('管理后台路由', () => {
    it('/api/admin/users 有效 admin_token 通过认证', async () => {
      const token = await signJwt('admin-1', 'admin', JWT_SECRET, 3600)
      const request = createMockRequest('/api/admin/users', { admin_token: token })
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(response.status).toBe(200)
      expect(ctx.next).toHaveBeenCalled()
      expect(ctx.data.isAdmin).toBe(true)
    })

    it('/api/admin/users 无 admin_token 返回 401', async () => {
      const request = createMockRequest('/api/admin/users')
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(response.status).toBe(401)
      expect(ctx.next).not.toHaveBeenCalled()
    })

    it('/api/admin/login 无需 admin_token', async () => {
      const request = createMockRequest('/api/admin/login')
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(response.status).toBe(200)
      expect(ctx.next).toHaveBeenCalled()
    })
  })

  describe('安全头', () => {
    it('成功响应包含 Content-Security-Policy', async () => {
      const token = await signJwt('user-1', 'user', JWT_SECRET, 3600)
      const request = createMockRequest('/api/chat', { auth_token: token })
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(response.headers.get('Content-Security-Policy')).toBeTruthy()
    })

    it('401 错误响应包含 Content-Security-Policy', async () => {
      const request = createMockRequest('/api/chat')
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(response.status).toBe(401)
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy()
    })

    it('所有响应包含 X-Content-Type-Options: nosniff', async () => {
      const request = createMockRequest('/api/auth/send-code')
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })

    it('所有响应包含 X-Frame-Options: DENY', async () => {
      const request = createMockRequest('/api/auth/send-code')
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    })
  })

  describe('非 API 路由', () => {
    it('非 /api/ 路径直接放行并添加安全头', async () => {
      const request = createMockRequest('/about')
      const ctx = createMockContext(request)

      const response = await runMiddleware(ctx)

      expect(ctx.next).toHaveBeenCalled()
      expect(response.status).toBe(200)
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })
  })
})
