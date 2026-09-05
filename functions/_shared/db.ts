// D1 数据库查询 helpers
// 所有写入操作使用 fire-and-forget 模式（不阻塞请求）

// ===== 验证码 =====

export async function checkSendRateLimit(db: D1Database, phoneHash: string): Promise<{ allowed: boolean; reason?: string }> {
  // 60秒内是否已发送
  const recent = await db.prepare(
    `SELECT COUNT(*) as cnt FROM verification_codes WHERE phone_hash = ? AND created_at > datetime('now', '-1 minute')`
  ).bind(phoneHash).first<{ cnt: number }>()
  if (recent && recent.cnt >= 1) return { allowed: false, reason: '请等待60秒后再发送' }

  // 每日最多10次
  const daily = await db.prepare(
    `SELECT COUNT(*) as cnt FROM verification_codes WHERE phone_hash = ? AND created_at > datetime('now', '-1 day')`
  ).bind(phoneHash).first<{ cnt: number }>()
  if (daily && daily.cnt >= 10) return { allowed: false, reason: '今日发送次数已达上限' }

  return { allowed: true }
}

export async function saveVerificationCode(db: D1Database, phoneHash: string, code: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  await db.prepare(
    `INSERT INTO verification_codes (phone_hash, code, expires_at) VALUES (?, ?, ?)`
  ).bind(phoneHash, code, expiresAt).run()
  // CQ-6: 清理过期验证码（防止表无限增长）
  db.prepare(`DELETE FROM verification_codes WHERE expires_at < datetime('now')`)
    .run().catch(e => console.warn('[DB] 过期验证码清理失败:', e))
}

export async function verifyCode(db: D1Database, phoneHash: string, code: string): Promise<{ valid: boolean; reason?: string }> {
  const row = await db.prepare(
    `SELECT id, code, attempts FROM verification_codes WHERE phone_hash = ? AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1`
  ).bind(phoneHash).first<{ id: number; code: string; attempts: number }>()

  if (!row) return { valid: false, reason: '验证码已过期，请重新发送' }
  if (row.attempts >= 3) return { valid: false, reason: '验证码错误次数过多，请重新发送' }

  const { constantTimeCompare } = await import('./auth')
  const codeMatch = await constantTimeCompare(row.code, code)
  if (!codeMatch) {
    await db.prepare(`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?`).bind(row.id).run()
    const remaining = 2 - row.attempts
    return { valid: false, reason: `验证码错误，还剩${remaining}次机会` }
  }

  // 验证成功，删除该验证码
  await db.prepare(`DELETE FROM verification_codes WHERE id = ?`).bind(row.id).run()
  return { valid: true }
}

// ===== 用户 =====

export interface DbUser {
  id: string
  phone: string
  phone_hash: string
  nickname: string | null
  grade: number | null
  onboarding_completed: number
  created_at: string
  last_active_at: string | null
}

export async function findUserByPhoneHash(db: D1Database, phoneHash: string): Promise<DbUser | null> {
  return db.prepare(`SELECT * FROM users WHERE phone_hash = ?`).bind(phoneHash).first<DbUser>()
}

export async function createUser(db: D1Database, id: string, phone: string, phoneHash: string): Promise<void> {
  await db.prepare(
    `INSERT INTO users (id, phone, phone_hash) VALUES (?, ?, ?)`
  ).bind(id, phone, phoneHash).run()
}

export async function updateUserProfile(db: D1Database, userId: string, nickname: string, grade: number): Promise<void> {
  await db.prepare(
    `UPDATE users SET nickname = ?, grade = ?, last_active_at = datetime('now') WHERE id = ?`
  ).bind(nickname, grade, userId).run()
}

export async function markOnboardingComplete(db: D1Database, userId: string): Promise<void> {
  await db.prepare(
    `UPDATE users SET onboarding_completed = 1 WHERE id = ?`
  ).bind(userId).run()
}

export async function touchUserActivity(db: D1Database, userId: string): Promise<void> {
  await db.prepare(
    `UPDATE users SET last_active_at = datetime('now') WHERE id = ?`
  ).bind(userId).run()
}

// ===== 对话 =====

export class ConversationAccessError extends Error {
  constructor() { super('Conversation unavailable'); this.name = 'ConversationAccessError' }
}

export async function ensureConversation(db: D1Database, conversationId: string, userId: string): Promise<void> {
  if (!userId) throw new ConversationAccessError()
  // Await creation and then verify the winner of any concurrent insert.
  await db.prepare(`INSERT OR IGNORE INTO conversations (id, user_id) VALUES (?, ?)`)
    .bind(conversationId, userId).run()
  const owner = await db.prepare(`SELECT user_id FROM conversations WHERE id = ?`)
    .bind(conversationId).first<{ user_id: string }>()
  if (!owner || owner.user_id !== userId) throw new ConversationAccessError()
}

export async function addMessage(
  db: D1Database,
  messageId: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  inputMethod?: string,
  meta?: { emotion?: string; sessionPhase?: string; complianceIssues?: string[] },
  userId = ''
): Promise<void> {
  if (!userId) throw new ConversationAccessError()
  const complianceJson = meta?.complianceIssues?.length ? JSON.stringify(meta.complianceIssues) : null
  // D1 batch is transactional: message and count succeed together. The insert
  // predicate remains scoped even if callers forget the earlier ownership check.
  const result = await db.batch([
    db.prepare(`INSERT INTO messages (id, conversation_id, role, content, input_method, emotion, session_phase, compliance_issues)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM conversations WHERE id = ? AND user_id = ?)`)
      .bind(messageId, conversationId, role, content, inputMethod || null, meta?.emotion || null, meta?.sessionPhase || null, complianceJson, conversationId, userId),
    db.prepare(`UPDATE conversations SET message_count = message_count + 1 WHERE id = ? AND user_id = ?`)
      .bind(conversationId, userId),
  ])
  if (result[0]?.meta.changes !== 1) throw new ConversationAccessError()

}

export async function endConversation(
  db: D1Database,
  conversationId: string,
  auditFlags?: string[],
  analytics?: {
    resolutionType?: string
    emotionTrajectory?: string[]
    ocrText?: string
    strategiesUsed?: string[]
    hintCount?: number
    struggleDuration?: number
  },
  subject?: string
): Promise<void> {
  const flagsJson = auditFlags && auditFlags.length > 0 ? JSON.stringify(auditFlags) : null
  await db.prepare(
    `UPDATE conversations SET
      ended_at = datetime('now'),
      duration_seconds = CAST((julianday(datetime('now')) - julianday(started_at)) * 86400 AS INTEGER),
      subject = COALESCE(?, subject),
      audit_flags = COALESCE(?, audit_flags),
      resolution_type = COALESCE(?, resolution_type),
      emotion_trajectory = COALESCE(?, emotion_trajectory),
      ocr_text = COALESCE(?, ocr_text),
      strategies_used = COALESCE(?, strategies_used),
      hint_count = COALESCE(?, hint_count),
      struggle_duration_ms = COALESCE(?, struggle_duration_ms)
    WHERE id = ?`
  ).bind(
    subject ?? null,
    flagsJson,
    analytics?.resolutionType ?? null,
    analytics?.emotionTrajectory ? JSON.stringify(analytics.emotionTrajectory) : null,
    analytics?.ocrText ?? null,
    analytics?.strategiesUsed ? JSON.stringify(analytics.strategiesUsed) : null,
    analytics?.hintCount ?? null,
    analytics?.struggleDuration ?? null,
    conversationId
  ).run()
}

// ===== Admin 限流 =====

export async function checkAdminRateLimit(db: D1Database, ipHash: string): Promise<{ allowed: boolean; remaining: number }> {
  const result = await db.prepare(
    `SELECT COUNT(*) as cnt FROM admin_login_attempts WHERE ip_hash = ? AND success = 0 AND created_at > datetime('now', '-10 minutes')`
  ).bind(ipHash).first<{ cnt: number }>()
  const attempts = result?.cnt || 0
  return { allowed: attempts < 5, remaining: Math.max(0, 5 - attempts) }
}

export async function recordAdminAttempt(db: D1Database, ipHash: string, success: boolean): Promise<void> {
  await db.prepare(
    `INSERT INTO admin_login_attempts (ip_hash, success) VALUES (?, ?)`
  ).bind(ipHash, success ? 1 : 0).run()
  // CQ-6: 清理 1 小时前的登录尝试记录（防止表无限增长）
  db.prepare(`DELETE FROM admin_login_attempts WHERE created_at < datetime('now', '-1 hour')`)
    .run().catch(e => console.warn('[DB] 旧登录记录清理失败:', e))
}

// ===== Admin 查询 =====

export async function getAllUsers(db: D1Database): Promise<DbUser[]> {
  const result = await db.prepare(`SELECT * FROM users ORDER BY last_active_at DESC`).all<DbUser>()
  return result.results
}

export interface DbConversation {
  id: string
  user_id: string
  subject: string | null
  started_at: string
  ended_at: string | null
  message_count: number
  duration_seconds: number | null
  audit_flags: string | null
  resolution_type: string | null
  emotion_trajectory: string | null
  ocr_text: string | null
  strategies_used: string | null
  hint_count: number | null
  struggle_duration_ms: number | null
  nickname?: string
  grade?: number
}

export async function getConversations(db: D1Database, userId?: string): Promise<DbConversation[]> {
  const query = userId
    ? `SELECT c.*, u.nickname, u.grade FROM conversations c JOIN users u ON c.user_id = u.id WHERE c.user_id = ? ORDER BY c.started_at DESC LIMIT 100`
    : `SELECT c.*, u.nickname, u.grade FROM conversations c JOIN users u ON c.user_id = u.id ORDER BY c.started_at DESC LIMIT 100`
  const stmt = userId ? db.prepare(query).bind(userId) : db.prepare(query)
  const result = await stmt.all<DbConversation>()
  return result.results
}

export interface DbMessage {
  id: string
  conversation_id: string
  role: string
  content: string
  input_method: string | null
  emotion: string | null
  session_phase: string | null
  compliance_issues: string | null
  created_at: string
}

export async function getMessages(db: D1Database, conversationId: string): Promise<DbMessage[]> {
  const result = await db.prepare(
    `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
  ).bind(conversationId).all<DbMessage>()
  return result.results
}

export async function getStats(db: D1Database): Promise<{
  totalUsers: number
  activeToday: number
  totalConversations: number
  avgDuration: number | null
}> {
  const [users, active, convs, dur] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as cnt FROM users`).first<{ cnt: number }>(),
    db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE last_active_at > datetime('now', '-1 day')`).first<{ cnt: number }>(),
    db.prepare(`SELECT COUNT(*) as cnt FROM conversations`).first<{ cnt: number }>(),
    db.prepare(`SELECT AVG(duration_seconds) as avg FROM conversations WHERE duration_seconds IS NOT NULL`).first<{ avg: number | null }>(),
  ])
  return {
    totalUsers: users?.cnt || 0,
    activeToday: active?.cnt || 0,
    totalConversations: convs?.cnt || 0,
    avgDuration: dur?.avg ? Math.round(dur.avg) : null,
  }
}
