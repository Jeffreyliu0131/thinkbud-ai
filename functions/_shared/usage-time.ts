// 使用时长限制（COMP-01）
// D1-based daily usage tracking
// 情绪优先原则：所有用户可见消息用温暖的教育化措辞

const DAILY_MAX_MINUTES = 90   // 每日最多 90 分钟
const SESSION_MAX_MINUTES = 30 // 单次最长 30 分钟（与 STAB-02 对齐）

let usageTableInitialized = false

async function ensureUsageTable(db: D1Database): Promise<void> {
  if (usageTableInitialized) return
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS usage_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      session_type TEXT NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT
    )
  `).run()
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_usage_sessions_user_day
    ON usage_sessions (user_id, started_at)
  `).run()
  usageTableInitialized = true
}

/** 检查用户今日剩余可用时长 */
export async function checkDailyUsage(
  db: D1Database,
  userId: string
): Promise<{ allowed: boolean; remainingMinutes: number; message?: string }> {
  await ensureUsageTable(db)

  const result = await db.prepare(`
    SELECT COALESCE(SUM(
      CAST((julianday(COALESCE(ended_at, datetime('now'))) - julianday(started_at)) * 24 * 60 AS INTEGER)
    ), 0) as total_minutes
    FROM usage_sessions
    WHERE user_id = ? AND started_at > datetime('now', 'start of day')
  `).bind(userId).first<{ total_minutes: number }>()

  const used = result?.total_minutes || 0
  const remaining = Math.max(0, DAILY_MAX_MINUTES - used)

  if (remaining <= 0) {
    return {
      allowed: false,
      remainingMinutes: 0,
      message: '今天学了不少了，你的大脑也需要消化一下。明天再来找我聊吧！',
    }
  }

  if (remaining <= 15) {
    return {
      allowed: true,
      remainingMinutes: remaining,
      message: `今天还能聊${remaining}分钟，把最想弄懂的先问完吧`,
    }
  }

  return { allowed: true, remainingMinutes: remaining }
}

/** 记录会话开始，返回 session ID 供后续 endUsageSession 使用 */
export async function startUsageSession(
  db: D1Database,
  userId: string,
  sessionType: 'rtc' | 'chat'
): Promise<number | null> {
  await ensureUsageTable(db)
  const result = await db.prepare(
    `INSERT INTO usage_sessions (user_id, session_type) VALUES (?, ?) RETURNING id`
  ).bind(userId, sessionType).first<{ id: number }>()
  return result?.id ?? null
}

/** 记录会话结束 */
export async function endUsageSession(
  db: D1Database,
  sessionId: number
): Promise<void> {
  await db.prepare(
    `UPDATE usage_sessions SET ended_at = datetime('now') WHERE id = ? AND ended_at IS NULL`
  ).bind(sessionId).run()
}

export { DAILY_MAX_MINUTES, SESSION_MAX_MINUTES }
