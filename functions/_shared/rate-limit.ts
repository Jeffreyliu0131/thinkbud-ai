// IP 级别频率限制（基于 D1）
// 表 rate_limits 会在首次使用时自动创建

const ENCODER = new TextEncoder()

async function hashIp(ip: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', ENCODER.encode(ip))
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

let tableInitialized = false

async function ensureTable(db: D1Database): Promise<void> {
  if (tableInitialized) return
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run()
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_rate_limits_key_time ON rate_limits (key, created_at)
  `).run()
  tableInitialized = true
}

/**
 * 检查 IP 频率限制
 * @param db D1 数据库
 * @param ip 客户端 IP
 * @param endpoint 端点标识（如 'send-code'、'verify'）
 * @param maxRequests 窗口内最大请求数
 * @param windowMinutes 时间窗口（分钟）
 */
export async function checkIpRateLimit(
  db: D1Database,
  ip: string,
  endpoint: string,
  maxRequests: number,
  windowMinutes: number
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  await ensureTable(db)

  const ipHash = await hashIp(ip)
  const key = `${endpoint}:${ipHash}`

  const result = await db.prepare(
    `SELECT COUNT(*) as cnt FROM rate_limits WHERE key = ? AND created_at > datetime('now', ?)`
  ).bind(key, `-${windowMinutes} minutes`).first<{ cnt: number }>()

  const count = result?.cnt || 0
  if (count >= maxRequests) {
    return { allowed: false, retryAfterSeconds: windowMinutes * 60 }
  }

  // 记录本次请求
  await db.prepare(`INSERT INTO rate_limits (key) VALUES (?)`).bind(key).run()

  // 清理过期记录（fire-and-forget，不阻塞请求）
  db.prepare(`DELETE FROM rate_limits WHERE created_at < datetime('now', '-1 hour')`)
    .run()
    .catch(() => {})

  return { allowed: true }
}

/**
 * Per-user API 频率限制（STAB-05）
 * 复用 rate_limits 表，key 格式: "user:{endpoint}:{userId}"
 * @param db D1 数据库
 * @param userId 用户 ID（from context.data.userId）
 * @param endpoint 端点标识（'chat' | 'tts' | 'stt' | 'ocr'）
 * @param maxRequests 窗口内最大请求数
 * @param windowMinutes 时间窗口（分钟）
 */
export async function checkUserRateLimit(
  db: D1Database,
  userId: string,
  endpoint: string,
  maxRequests: number,
  windowMinutes: number
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  await ensureTable(db)

  const key = `user:${endpoint}:${userId}`

  const result = await db.prepare(
    `SELECT COUNT(*) as cnt FROM rate_limits WHERE key = ? AND created_at > datetime('now', ?)`
  ).bind(key, `-${windowMinutes} minutes`).first<{ cnt: number }>()

  const count = result?.cnt || 0
  if (count >= maxRequests) {
    return { allowed: false, retryAfterSeconds: windowMinutes * 60 }
  }

  await db.prepare(`INSERT INTO rate_limits (key) VALUES (?)`).bind(key).run()

  // Fire-and-forget cleanup
  db.prepare(`DELETE FROM rate_limits WHERE created_at < datetime('now', '-1 hour')`)
    .run()
    .catch(() => {})

  return { allowed: true }
}

/** 从 Cloudflare 请求中获取客户端 IP */
export function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || '0.0.0.0'
}
