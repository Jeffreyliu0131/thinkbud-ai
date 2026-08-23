// GET /api/parent/report?range=7d|30d|all
// 家长端学习报告 API：聚合对话、评估事件、知识点数据
// 成长叙事框架：进步优先，薄弱点用"正在探索"表述

import type { AppEnv, ContextData } from '../../_shared/env'
import { jsonResponse, errorResponse } from '../../_shared/utils/response'

// ===== 置信度 -> 文字标签映射（锁定决策）=====

type ConfidenceLevel = 'low' | 'mid' | 'high'

function confidenceToLabel(confidence: number): { label: string; level: ConfidenceLevel } {
  if (confidence < 0.4) return { label: '正在探索', level: 'low' }
  if (confidence <= 0.7) return { label: '逐渐掌握', level: 'mid' }
  return { label: '已经很熟练', level: 'high' }
}

// ===== 时间衰减（与 knowledgeGraph.ts 一致，服务端独立实现）=====

function applyTimeDecay(confidence: number, lastSeenIso: string): number {
  const lastSeenMs = new Date(lastSeenIso).getTime()
  const nowMs = Date.now()
  const daysSince = (nowMs - lastSeenMs) / (1000 * 60 * 60 * 24)
  return confidence * Math.exp(-0.01 * daysSince)
}

// ===== 学科中文标签 =====

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学',
  chinese: '语文',
  english: '英语',
}

function subjectLabel(subject: string | null): string | null {
  if (!subject) return null
  return SUBJECT_LABELS[subject] ?? subject
}

// ===== 安心叙事 =====

function buildReassuranceNarrative(weeklyCount: number): string {
  if (weeklyCount >= 5) return '进步很明显'
  if (weeklyCount >= 3) return '保持得不错'
  if (weeklyCount >= 1) return '正在慢慢找到节奏'
  return '这周还没开始学习哦'
}

// ===== 安全 JSON 解析 =====

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// ===== 安全 D1 查询（表可能不存在时使用）=====

async function safeQueryAll<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<D1Result<T>> {
  try {
    return await db.prepare(sql).bind(...binds).all<T>()
  } catch {
    return { results: [], success: true, meta: {} as D1Result<T>['meta'] }
  }
}

// ===== SQL 查询行类型 =====

interface ConvStatsRow {
  total_sessions: number
  avg_duration: number | null
  independent_count: number
}

interface TotalRow {
  total: number
}

interface SubjectRow {
  subject: string
  count: number
}

interface WeeklyRow {
  weekly_count: number
}

interface CoachNoteRow {
  id: string
  subject: string | null
  started_at: string
  duration_seconds: number | null
  coach_note: string
}

interface KnowledgeRow {
  concept: string
  subject: string
  label: string
  confidence: number
  encounters: number
  last_seen: string
}

interface DailyRow {
  day: string
  count: number
}

interface ConversationRow {
  id: string
  started_at: string
  duration_seconds: number | null
  subject: string | null
  coach_note: string | null
  strategies_used: string | null
  resolution_type: string | null
}

interface NicknameRow {
  nickname: string | null
}

// ===== coach_note JSON 结构 =====

interface CoachNoteJson {
  topic?: string
  stuck_at?: string
  strategies?: string[]
  highlight_quote?: string
  summary?: string
}

// ===== 日期范围计算 =====

type ReportRange = '7d' | '30d' | 'all'

function parseDateRange(range: string | null): ReportRange {
  if (range === '30d') return '30d'
  if (range === 'all') return 'all'
  return '7d' // 默认 7 天
}

function sinceClause(range: ReportRange): string {
  switch (range) {
    case '7d': return "datetime('now', '-7 days')"
    case '30d': return "datetime('now', '-30 days')"
    case 'all': return "datetime('now', '-10 years')"
  }
}

// ===== 主 handler =====

export const onRequestGet: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const userId = context.data.userId
    if (!userId) {
      return errorResponse('未登录', 401)
    }

    const url = new URL(context.request.url)
    const range = parseDateRange(url.searchParams.get('range'))
    const since = sinceClause(range)
    const db = context.env.DB

    // 并行执行所有 D1 查询
    const [
      userRow,
      convStats,
      totalConvs,
      subjectBreakdown,
      weeklyActivity,
      coachNotes,
      knowledgePoints,
      dailyActivity,
      recentConversations,
    ] = await Promise.all([
      // 1. 用户信息
      db.prepare(`SELECT nickname FROM users WHERE id = ?`)
        .bind(userId).first<NicknameRow>(),

      // 2. 范围内对话统计
      db.prepare(`
        SELECT COUNT(*) as total_sessions,
               AVG(duration_seconds) as avg_duration,
               SUM(CASE WHEN resolution_type = 'independent' THEN 1 ELSE 0 END) as independent_count
        FROM conversations WHERE user_id = ? AND started_at >= ${since}
      `).bind(userId).first<ConvStatsRow>(),

      // 3. 总对话数（全时段，用于冷启动）
      db.prepare(`SELECT COUNT(*) as total FROM conversations WHERE user_id = ?`)
        .bind(userId).first<TotalRow>(),

      // 4. 学科分布
      db.prepare(`
        SELECT subject, COUNT(*) as count
        FROM conversations WHERE user_id = ? AND started_at >= ${since} AND subject IS NOT NULL
        GROUP BY subject
      `).bind(userId).all<SubjectRow>(),

      // 5. 本周活跃度（固定 7 天，用于安心叙事）
      db.prepare(`
        SELECT COUNT(*) as weekly_count FROM conversations
        WHERE user_id = ? AND started_at >= datetime('now', '-7 days')
      `).bind(userId).first<WeeklyRow>(),

      // 6. 最近教练笔记（限 10 条）
      db.prepare(`
        SELECT id, subject, started_at, duration_seconds, coach_note
        FROM conversations WHERE user_id = ? AND coach_note IS NOT NULL AND started_at >= ${since}
        ORDER BY started_at DESC LIMIT 10
      `).bind(userId).all<CoachNoteRow>(),

      // 7. 知识点（表可能尚未迁移，安全降级为空）
      safeQueryAll<KnowledgeRow>(db, `
        SELECT concept, subject, label, confidence, encounters, last_seen
        FROM knowledge_points WHERE user_id = ?
        ORDER BY subject, confidence ASC
      `, userId),

      // 8. 每日活跃度（图表用）
      db.prepare(`
        SELECT DATE(started_at) as day, COUNT(*) as count
        FROM conversations WHERE user_id = ? AND started_at >= ${since}
        GROUP BY DATE(started_at) ORDER BY day
      `).bind(userId).all<DailyRow>(),

      // 9. 最近对话列表（限 20 条）
      db.prepare(`
        SELECT id, started_at, duration_seconds, subject, coach_note, strategies_used, resolution_type
        FROM conversations WHERE user_id = ? AND started_at >= ${since}
        ORDER BY started_at DESC LIMIT 20
      `).bind(userId).all<ConversationRow>(),
    ])

    // ===== 数据组装 =====

    const totalSessions = convStats?.total_sessions ?? 0
    const avgDurationSeconds = convStats?.avg_duration ?? 0
    const independentCount = convStats?.independent_count ?? 0
    const weeklyCount = weeklyActivity?.weekly_count ?? 0

    // 独立率（处理除零）
    const independenceRate = totalSessions > 0
      ? Math.round((independentCount / totalSessions) * 100)
      : 0

    // 最常练习学科
    const subjectRows = subjectBreakdown.results
    let mostPracticedSubject: string | null = null
    if (subjectRows.length > 0) {
      const top = subjectRows.reduce((a, b) => a.count > b.count ? a : b)
      mostPracticedSubject = subjectLabel(top.subject)
    }

    // 知识点：应用时间衰减 + 按学科分组
    const kpRows = knowledgePoints.results
    const decayedKp = kpRows.map(kp => ({
      ...kp,
      decayedConfidence: applyTimeDecay(kp.confidence, kp.last_seen),
    }))

    // 学科进度：按学科聚合
    const subjectMap = new Map<string, { totalConfidence: number; count: number; convCount: number }>()
    for (const kp of decayedKp) {
      const existing = subjectMap.get(kp.subject) ?? { totalConfidence: 0, count: 0, convCount: 0 }
      existing.totalConfidence += kp.decayedConfidence
      existing.count += 1
      subjectMap.set(kp.subject, existing)
    }
    // 合入对话学科数量
    for (const sr of subjectRows) {
      const existing = subjectMap.get(sr.subject) ?? { totalConfidence: 0, count: 0, convCount: 0 }
      existing.convCount = sr.count
      subjectMap.set(sr.subject, existing)
    }

    const subjectProgress = Array.from(subjectMap.entries()).map(([subject, data]) => {
      const avgConfidence = data.count > 0 ? data.totalConfidence / data.count : 0
      const { label: masteryLabel } = confidenceToLabel(avgConfidence)
      return {
        subject: subjectLabel(subject) ?? subject,
        count: data.convCount,
        masteryLabel,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
      }
    })

    // 薄弱点：衰减后 < 0.4 且遇到 >= 2 次，取最近 3 个
    const weakPoints = decayedKp
      .filter(kp => kp.decayedConfidence < 0.4 && kp.encounters >= 2)
      .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime())
      .slice(0, 3)
      .map(kp => ({
        concept: kp.concept,
        label: kp.label,
        subject: subjectLabel(kp.subject) ?? kp.subject,
      }))

    // 亮点时刻：从教练笔记中提取
    const highlights = coachNotes.results
      .map(cn => {
        const note = safeParseJson<CoachNoteJson>(cn.coach_note)
        if (!note) return null
        return {
          date: cn.started_at,
          subject: subjectLabel(cn.subject),
          summary: note.summary ?? note.topic ?? '',
          highlightQuote: note.highlight_quote ?? null,
        }
      })
      .filter((h): h is NonNullable<typeof h> => h !== null && h.summary !== '')

    // 对话列表
    const conversations = recentConversations.results.map(c => {
      const note = safeParseJson<CoachNoteJson>(c.coach_note)
      const strategies = safeParseJson<string[]>(c.strategies_used) ?? []
      return {
        id: c.id,
        date: c.started_at,
        durationMinutes: c.duration_seconds != null ? Math.round(c.duration_seconds / 60) : null,
        subject: subjectLabel(c.subject),
        topic: note?.topic ?? null,
        strategies,
        resolutionType: c.resolution_type,
      }
    })

    // 每日活跃度
    const dailyActivityData = dailyActivity.results.map(d => ({
      date: d.day,
      count: d.count,
    }))

    // ===== 组装最终报告 =====

    const report = {
      range,
      totalConversations: totalConvs?.total ?? 0,
      childName: userRow?.nickname ?? null,
      // 成长叙事框架：安心叙事在最前面
      reassurance: {
        weeklyCount,
        narrative: buildReassuranceNarrative(weeklyCount),
      },
      stats: {
        totalSessions,
        avgDurationMinutes: Math.round(avgDurationSeconds / 60),
        independenceRate,
        mostPracticedSubject,
      },
      subjectProgress,
      weakPoints,
      highlights,
      conversations,
      dailyActivity: dailyActivityData,
    }

    return jsonResponse(report)
  } catch (err) {
    console.error('[ParentReport]', err)
    return errorResponse('获取学习报告失败')
  }
}
