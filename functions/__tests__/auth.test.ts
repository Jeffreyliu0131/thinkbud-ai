import { describe, it, expect } from 'vitest'
import {
  signJwt,
  verifyJwt,
  constantTimeCompare,
  hashPhone,
  generateCode,
  parseCookies,
  setCookieHeader,
  clearCookieHeader,
} from '../_shared/auth'

// ── JWT ──────────────────────────────────────────────

describe('JWT 签发与验证', () => {
  const SECRET = 'test-secret-key-123'

  it('signJwt 生成有效 token', async () => {
    const token = await signJwt('user-1', 'user', SECRET, 3600)
    expect(token).toBeTruthy()
    expect(token.split('.')).toHaveLength(3)
  })

  it('verifyJwt 验证有效 token', async () => {
    const token = await signJwt('user-1', 'user', SECRET, 3600)
    const payload = await verifyJwt(token, SECRET)
    expect(payload).not.toBeNull()
    expect(payload!.sub).toBe('user-1')
    expect(payload!.role).toBe('user')
  })

  it('admin role 正确保存', async () => {
    const token = await signJwt('admin-1', 'admin', SECRET, 3600)
    const payload = await verifyJwt(token, SECRET)
    expect(payload!.role).toBe('admin')
  })

  it('错误 secret 验证失败', async () => {
    const token = await signJwt('user-1', 'user', SECRET, 3600)
    const payload = await verifyJwt(token, 'wrong-secret')
    expect(payload).toBeNull()
  })

  it('过期 token 验证失败', async () => {
    // TTL = 0 秒 → 签发时就过期
    const token = await signJwt('user-1', 'user', SECRET, 0)
    // 因为 iat 和 exp 都是 now，而 verify 检查 exp < now，
    // 刚签发的 exp=now 不会严格小于 now（边界），所以延迟一下
    await new Promise(r => setTimeout(r, 1100))
    const payload = await verifyJwt(token, SECRET)
    expect(payload).toBeNull()
  })

  it('畸形 token 返回 null', async () => {
    expect(await verifyJwt('not.a.jwt', SECRET)).toBeNull()
    expect(await verifyJwt('', SECRET)).toBeNull()
    expect(await verifyJwt('a.b', SECRET)).toBeNull()
  })

  it('payload 包含 iat 和 exp', async () => {
    const before = Math.floor(Date.now() / 1000)
    const token = await signJwt('user-1', 'user', SECRET, 3600)
    const payload = await verifyJwt(token, SECRET)
    expect(payload!.iat).toBeGreaterThanOrEqual(before)
    expect(payload!.exp).toBe(payload!.iat + 3600)
  })
})

// ── constantTimeCompare ──────────────────────────────────────

describe('constantTimeCompare', () => {
  it('相同字符串返回 true', async () => {
    expect(await constantTimeCompare('hello', 'hello')).toBe(true)
  })

  it('不同字符串返回 false', async () => {
    expect(await constantTimeCompare('hello', 'world')).toBe(false)
  })

  it('空字符串相等', async () => {
    expect(await constantTimeCompare('', '')).toBe(true)
  })

  it('长度不同返回 false', async () => {
    expect(await constantTimeCompare('short', 'longer-string')).toBe(false)
  })

  it('验证码比对场景', async () => {
    expect(await constantTimeCompare('123456', '123456')).toBe(true)
    expect(await constantTimeCompare('123456', '654321')).toBe(false)
  })
})

// ── hashPhone ──────────────────────────────────────────────

describe('hashPhone (HMAC-SHA256)', () => {
  const SECRET = 'test-hmac-secret'

  it('返回 64 字符十六进制字符串', async () => {
    const hash = await hashPhone('13800138000', SECRET)
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('相同号码+密钥产生相同 hash', async () => {
    const h1 = await hashPhone('13800138000', SECRET)
    const h2 = await hashPhone('13800138000', SECRET)
    expect(h1).toBe(h2)
  })

  it('不同号码产生不同 hash', async () => {
    const h1 = await hashPhone('13800138000', SECRET)
    const h2 = await hashPhone('13800138001', SECRET)
    expect(h1).not.toBe(h2)
  })

  it('不同密钥产生不同 hash', async () => {
    const h1 = await hashPhone('13800138000', SECRET)
    const h2 = await hashPhone('13800138000', 'different-secret')
    expect(h1).not.toBe(h2)
  })
})

// ── generateCode ──────────────────────────────────────────────

describe('generateCode', () => {
  it('生成 6 位数字字符串', () => {
    const code = generateCode()
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^\d{6}$/)
  })

  it('多次生成不完全相同', () => {
    const codes = new Set(Array.from({ length: 10 }, () => generateCode()))
    // 10 次中至少有 2 个不同（概率极高）
    expect(codes.size).toBeGreaterThan(1)
  })
})

// ── Cookie 工具 ──────────────────────────────────────────────

describe('parseCookies', () => {
  it('解析标准 cookie 字符串', () => {
    const result = parseCookies('auth_token=abc123; theme=dark')
    expect(result).toEqual({ auth_token: 'abc123', theme: 'dark' })
  })

  it('空值返回空对象', () => {
    expect(parseCookies(null)).toEqual({})
    expect(parseCookies('')).toEqual({})
  })

  it('处理值中包含等号', () => {
    const result = parseCookies('token=abc=def=ghi')
    expect(result.token).toBe('abc=def=ghi')
  })
})

describe('setCookieHeader', () => {
  it('生成正确的 Set-Cookie 头', () => {
    const header = setCookieHeader('auth_token', 'abc123', 3600)
    expect(header).toContain('auth_token=abc123')
    expect(header).toContain('HttpOnly')
    expect(header).toContain('Secure')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Max-Age=3600')
  })
})

describe('clearCookieHeader', () => {
  it('生成清除 cookie 的头', () => {
    const header = clearCookieHeader('auth_token')
    expect(header).toContain('auth_token=')
    expect(header).toContain('Max-Age=0')
  })
})
