// JWT + Cookie + 密码比对 工具
// 依赖 Web Crypto API（Cloudflare Workers 原生支持）

const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' }
const ENCODER = new TextEncoder()

// ===== JWT =====

interface JwtPayload {
  sub: string       // userId
  role: 'user' | 'admin'
  iat: number
  exp: number
}

function ownedBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength)
  new Uint8Array(buffer).set(value)
  return buffer
}

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - str.length % 4) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', ownedBuffer(ENCODER.encode(secret)), ALGORITHM, false, ['sign', 'verify'])
}

export async function signJwt(userId: string, role: 'user' | 'admin', secret: string, ttlSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(ENCODER.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = base64url(ENCODER.encode(JSON.stringify({
    sub: userId,
    role,
    iat: now,
    exp: now + ttlSeconds,
  } satisfies JwtPayload)))

  const key = await getKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, ENCODER.encode(`${header}.${payload}`))
  return `${header}.${payload}.${base64url(sig)}`
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const key = await getKey(secret)
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      ownedBuffer(base64urlDecode(parts[2])),
      ownedBuffer(ENCODER.encode(`${parts[0]}.${parts[1]}`))
    )
    if (!valid) return null

    const payload: JwtPayload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])))
    if (payload.exp < Math.floor(Date.now() / 1000)) return null

    return payload
  } catch {
    return null
  }
}

// ===== Cookie =====

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {}
  const cookies: Record<string, string> = {}
  for (const pair of cookieHeader.split(';')) {
    const [key, ...rest] = pair.trim().split('=')
    if (key) cookies[key.trim()] = rest.join('=').trim()
  }
  return cookies
}

/**
 * isLocalDev: 本地 wrangler dev 通过 HTTP 运行，Secure cookie 会被浏览器忽略。
 * 传入 request.url 自动检测，生产环境（HTTPS）仍保留 Secure 标记。
 */
export function setCookieHeader(name: string, value: string, ttlSeconds: number, requestUrl?: string): string {
  const hostname = requestUrl ? new URL(requestUrl).hostname : ''
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname)
  const secure = isLocal ? '' : ' Secure;'
  return `${name}=${value}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${ttlSeconds}`
}

export function clearCookieHeader(name: string, requestUrl?: string): string {
  const hostname = requestUrl ? new URL(requestUrl).hostname : ''
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname)
  const secure = isLocal ? '' : ' Secure;'
  return `${name}=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0`
}

// ===== 密码比对（constant-time）=====

export async function constantTimeCompare(a: string, b: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', ENCODER.encode('compare-key'), ALGORITHM, false, ['sign'])
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, ENCODER.encode(a)),
    crypto.subtle.sign('HMAC', key, ENCODER.encode(b)),
  ])
  const bufA = new Uint8Array(sigA)
  const bufB = new Uint8Array(sigB)
  if (bufA.length !== bufB.length) return false
  let diff = 0
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i]
  return diff === 0
}

// ===== 手机号哈希 =====

/** @deprecated Legacy unsalted SHA-256 hash -- used for backward-compatible lookups */
export async function hashPhoneLegacy(phone: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', ownedBuffer(ENCODER.encode(phone)))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** HMAC-SHA256 phone hash with server-side secret (SEC-04) */
export async function hashPhone(phone: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, ENCODER.encode(phone))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Look up user by phone, trying HMAC hash first, falling back to legacy hash */
export async function findUserByPhone(
  db: D1Database,
  phone: string,
  hmacSecret: string
): Promise<{ id: string; phone_hash: string; nickname: string | null; grade: number | null; onboarding_completed: number } | null> {
  const hmacHash = await hashPhone(phone, hmacSecret)
  // Try HMAC hash first
  let user = await db.prepare('SELECT id, phone_hash, nickname, grade, onboarding_completed FROM users WHERE phone_hash = ?')
    .bind(hmacHash).first<{ id: string; phone_hash: string; nickname: string | null; grade: number | null; onboarding_completed: number }>()
  if (user) return user

  // Fall back to legacy hash for un-migrated users
  const legacyHash = await hashPhoneLegacy(phone)
  user = await db.prepare('SELECT id, phone_hash, nickname, grade, onboarding_completed FROM users WHERE phone_hash = ?')
    .bind(legacyHash).first<{ id: string; phone_hash: string; nickname: string | null; grade: number | null; onboarding_completed: number }>()

  if (user) {
    // Auto-migrate: update to HMAC hash (fire-and-forget)
    db.prepare('UPDATE users SET phone_hash = ? WHERE id = ?')
      .bind(hmacHash, user.id).run().catch(e => console.warn('[Auth] HMAC 迁移写入失败:', e))
    user.phone_hash = hmacHash
  }

  return user
}

// ===== 验证码生成 =====

export function generateCode(): string {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return String(arr[0] % 1000000).padStart(6, '0')
}
