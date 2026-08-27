// Cloudflare Pages Function: 火山方舟 Chat 代理
// SSE 流式推送：POST { messages, gradeLevel, subject?, session?, sessionId?, inputMethod? } → text/event-stream
// 双通道：SSE 流发给客户端的同时，用户消息 + AI 回复写入 D1
// System Prompt 在服务端构建，前端不接触 prompt 内容

import { chatCompletionStream } from '../_shared/providers/chat/ark'
import { errorResponse } from '../_shared/utils/response'
import { checkUserRateLimit } from '../_shared/rate-limit'
import { ensureConversation, addMessage, touchUserActivity } from '../_shared/db'
import { buildSystemPrompt } from '../_shared/prompt'
import type { GradeLevel, Subject, SessionContext } from '../_shared/prompt'
import type { AppEnv, ContextData } from '../_shared/env'
import { startUsageSession } from '../_shared/usage-time'
import { parseMetaFromContent } from '../_shared/meta-parser'
import { sanitizeUntrustedText, wrapUntrustedContext } from '../_shared/input-safety'
import { collectThinkBudSse, createThinkBudSse, guardAiOutput } from '../_shared/output-guard'
import { buildChatRagContext } from '../_shared/rag/runtime'

const VALID_GRADE_LEVELS: ReadonlySet<string> = new Set(['lower', 'upper'])
const VALID_SUBJECTS: ReadonlySet<string> = new Set(['math', 'chinese', 'english'])
const MAX_LEARNER_CONTEXT_LENGTH = 2000
const MAX_MESSAGES = 40
const MAX_MESSAGE_LENGTH = 8_000

interface ChatRequest {
  messages: Array<{ role: string; content: string }>
  gradeLevel: GradeLevel
  subject?: Subject
  session?: SessionContext
  sessionId?: string      // 前端的会话 ID，作为 conversation.id
  inputMethod?: string    // 'voice' | 'text' | 'ocr'
  learnerContext?: string  // 学生画像记忆片段（可选）
  whiteboard?: boolean     // 启用白板步骤输出
}

export const onRequestPost: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const { messages, gradeLevel, subject, session, sessionId, inputMethod, learnerContext, whiteboard }: ChatRequest = await context.request.json()

    if (!Array.isArray(messages) || !gradeLevel) {
      return errorResponse('参数格式错误', 400)
    }
    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      return errorResponse(`messages 数量必须在 1-${MAX_MESSAGES} 之间`, 400)
    }

    // 白名单校验 gradeLevel 和 subject（信任边界）
    if (!VALID_GRADE_LEVELS.has(gradeLevel)) {
      return errorResponse('无效的 gradeLevel 参数', 400)
    }
    if (subject !== undefined && !VALID_SUBJECTS.has(subject)) {
      return errorResponse('无效的 subject 参数', 400)
    }

    // The browser is not a role-authority boundary. Reject client-supplied
    // system roles and sanitize every history item before model or D1 use.
    const safeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    for (const message of messages) {
      if (!message || (message.role !== 'user' && message.role !== 'assistant')) {
        return errorResponse('messages 只允许 user/assistant 角色', 400)
      }
      if (typeof message.content !== 'string' || message.content.trim().length === 0) {
        return errorResponse('message content 必须是非空字符串', 400)
      }
      const sanitized = sanitizeUntrustedText(message.content, { maxLength: MAX_MESSAGE_LENGTH })
      if (sanitized.flags.length > 0) {
        console.warn('[Chat Input Safety] sanitized flags:', sanitized.flags.join(','))
      }
      safeMessages.push({ role: message.role, content: sanitized.text })
    }

    // 校验 learnerContext：必须是字符串且不超过长度限制
    let sanitizedLearnerContext: string | undefined
    if (learnerContext !== undefined) {
      if (typeof learnerContext !== 'string') {
        return errorResponse('learnerContext 必须是字符串', 400)
      }
      const sanitized = sanitizeUntrustedText(learnerContext, { maxLength: MAX_LEARNER_CONTEXT_LENGTH })
      if (sanitized.flags.length > 0) {
        console.warn('[Chat Learner Context] sanitized flags:', sanitized.flags.join(','))
      }
      sanitizedLearnerContext = wrapUntrustedContext('learner_context', sanitized.text)
    }

    // 服务端构建 system prompt（防止前端绕过产品宪法）
    const systemPrompt = buildSystemPrompt(gradeLevel, { subject, session, learnerContext: sanitizedLearnerContext, enableWhiteboard: !!whiteboard })

    const userId = context.data.userId
    const db = context.env.DB
    const conversationId = sessionId || crypto.randomUUID()

    // Per-user 限流（STAB-05: 每分钟 10 次 chat）
    if (userId && db) {
      const rateCheck = await checkUserRateLimit(db, userId, 'chat', 10, 1)
      if (!rateCheck.allowed) {
        return errorResponse('请求过于频繁，请稍后再试', 429)
      }
    }

    // COMP-01: 使用时长跟踪（限制暂停——测试阶段无需限流，上线后按订阅等级重新设计）
    if (userId && db) {
      // 仍然记录会话，但不拒绝请求
      context.waitUntil(
        startUsageSession(db, userId, 'chat').catch(e => console.warn('[Chat] 使用时长记录失败:', e))
      )
    }

    // 写入用户消息到 D1（fire-and-forget）
    if (userId && db && safeMessages.length > 0) {
      const lastUserMsg = [...safeMessages].reverse().find(m => m.role === 'user')
      if (lastUserMsg) {
        context.waitUntil(
          (async () => {
            try {
              await ensureConversation(db, conversationId, userId)
              // 首次设置 subject（如果提供）
              if (subject) {
                await db.prepare(
                  `UPDATE conversations SET subject = COALESCE(subject, ?) WHERE id = ?`
                ).bind(subject, conversationId).run()
              }
              await addMessage(db, crypto.randomUUID(), conversationId, 'user', lastUserMsg.content, inputMethod)
              await touchUserActivity(db, userId)
            } catch (err) {
              console.error('[Chat D1 写入用户消息失败]', err)
            }
          })()
        )
      }
    }

    const lastUserMessage = [...safeMessages].reverse().find(message => message.role === 'user')
    const rag = await buildChatRagContext(context.env, {
      query: lastUserMessage?.content ?? '',
      subject: subject ?? 'math',
      gradeLabel: gradeLevel,
    })
    if (rag.status === 'degraded') {
      console.warn('[Chat RAG] degraded to non-RAG chat:', rag.reason)
    }

    const arkStream = await chatCompletionStream(
      context.env,
      {
        messages: safeMessages,
        systemPrompt,
        ...(rag.context ? { untrustedContexts: [rag.context] } : {}),
      }
    )

    // Safety trade-off: buffer the short tutoring turn, run the blocking guard,
    // then emit SSE. This prevents a leaked answer from reaching display/TTS.
    // The unguarded RTC path is feature-flagged off by default.
    const fullAiContent = await collectThinkBudSse(arkStream)
    const { cleanContent, meta } = parseMetaFromContent(fullAiContent)
    if (!cleanContent) throw new Error('AI 返回空内容')
    const guarded = guardAiOutput(cleanContent, gradeLevel)
    if (guarded.blocked) {
      console.warn('[Chat Output Guard] blocked:', guarded.blockingIssues.join(', '))
    }

    if (userId && db) {
      context.waitUntil(
        addMessage(db, crypto.randomUUID(), conversationId, 'assistant', guarded.content, undefined, {
          emotion: guarded.blocked ? undefined : meta?.emotion,
          sessionPhase: guarded.blocked ? undefined : meta?.session_phase,
          complianceIssues: guarded.issues.length > 0 ? guarded.issues : undefined,
        }).catch(err => console.error('[Chat D1 写入 AI 回复失败]', err))
      )
    }

    const outboundContent = guarded.blocked ? guarded.content : fullAiContent
    return new Response(createThinkBudSse(outboundContent), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'X-ThinkBud-Output-Guard': guarded.blocked ? 'blocked' : 'passed',
        'X-ThinkBud-RAG': rag.status,
        'X-ThinkBud-RAG-Citations': String(rag.citations.length),
        'X-ThinkBud-RAG-Truncated': String(rag.truncated),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '对话处理失败'
    console.error('[Chat]', message)
    return errorResponse(message)
  }
}
