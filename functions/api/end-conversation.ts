// POST /api/end-conversation — 前端会话结束时上报分析数据
import type { AppEnv, ContextData } from '../_shared/env'
import { checkUserRateLimit } from '../_shared/rate-limit'
import { endConversation } from '../_shared/db'
import { computeAssessment } from '../_shared/assessment-engine'
import { generateCoachNote } from '../_shared/coach-note'
import { jsonResponse, errorResponse } from '../_shared/utils/response'

interface EndConversationRequest {
  conversationId: string
  auditFlags?: string[]
  subject?: string  // 'math' | 'chinese' | 'english'
  analytics?: {
    resolutionType?: string
    emotionTrajectory?: string[]
    ocrText?: string
    strategiesUsed?: string[]
    hintCount?: number
    struggleDuration?: number
  }
}

export const onRequestPost: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const userId = context.data.userId
    if (!userId) {
      return errorResponse('未登录', 401)
    }

    const rateCheck = await checkUserRateLimit(context.env.DB, userId, 'end-conversation', 10, 1)
    if (!rateCheck.allowed) {
      return errorResponse('请求过于频繁，请稍后再试', 429)
    }

    const { conversationId, auditFlags, analytics, subject }: EndConversationRequest = await context.request.json()

    if (!conversationId) {
      return errorResponse('缺少 conversationId', 400)
    }

    const db = context.env.DB

    // 验证对话所有权
    const existing = await db.prepare(
      `SELECT user_id FROM conversations WHERE id = ?`
    ).bind(conversationId).first<{ user_id: string }>()
    if (!existing) {
      return errorResponse('对话不存在', 404)
    }
    if (existing.user_id !== userId) {
      return errorResponse('无权操作该对话', 403)
    }

    // fire-and-forget: endConversation + assessment computation in one waitUntil
    context.waitUntil(
      (async () => {
        try {
          // Write conversation analytics first
          await endConversation(db, conversationId, auditFlags, analytics, subject)

          // Read updated conversation row for assessment computation
          const conv = await db.prepare(
            `SELECT hint_count, message_count, resolution_type, duration_seconds, struggle_duration_ms FROM conversations WHERE id = ?`
          ).bind(conversationId).first<{
            hint_count: number | null
            message_count: number
            resolution_type: string | null
            duration_seconds: number | null
            struggle_duration_ms: number | null
          }>()

          if (!conv || conv.message_count < 2) return // Skip trivial conversations

          const assessment = computeAssessment(conv)

          await db.prepare(`
            INSERT INTO assessment_events (conversation_id, user_id, independence_level, guidance_efficiency, hint_count, message_count, duration_seconds, resolution_type, struggle_duration_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            conversationId, userId,
            assessment.independenceLevel,
            assessment.guidanceEfficiency,
            assessment.hintCount,
            assessment.messageCount,
            assessment.durationSeconds,
            assessment.resolutionType,
            assessment.struggleDurationMs
          ).run()

          // Coach note generation (PARENT-01) — separate try/catch, never affects assessment
          if (conv && conv.message_count >= 4) {
            try {
              const msgs = await db.prepare(
                `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 20`
              ).bind(conversationId).all<{ role: string; content: string }>()

              if (msgs.results.length >= 2) {
                const noteJson = await generateCoachNote(
                  context.env,
                  msgs.results.reverse(),
                  subject ?? 'math'
                )
                if (noteJson) {
                  await db.prepare(
                    `UPDATE conversations SET coach_note = ? WHERE id = ?`
                  ).bind(JSON.stringify(noteJson), conversationId).run()
                }
              }
            } catch (err) {
              console.warn('[CoachNote 生成失败]', err)
            }
          }
        } catch (err) {
          console.error('[EndConversation D1 写入失败]', err)
        }
      })()
    )

    return jsonResponse({ success: true })
  } catch (err) {
    console.error('[EndConversation]', err)
    return errorResponse('会话结束记录失败')
  }
}
