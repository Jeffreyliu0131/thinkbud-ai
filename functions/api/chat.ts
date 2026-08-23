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
import { auditAiResponse } from '../_shared/audit'
import { parseMetaFromContent } from '../_shared/meta-parser'

const VALID_GRADE_LEVELS: ReadonlySet<string> = new Set(['lower', 'upper'])
const VALID_SUBJECTS: ReadonlySet<string> = new Set(['math', 'chinese', 'english'])
const MAX_LEARNER_CONTEXT_LENGTH = 2000

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

    // 白名单校验 gradeLevel 和 subject（信任边界）
    if (!VALID_GRADE_LEVELS.has(gradeLevel)) {
      return errorResponse('无效的 gradeLevel 参数', 400)
    }
    if (subject !== undefined && !VALID_SUBJECTS.has(subject)) {
      return errorResponse('无效的 subject 参数', 400)
    }

    // 校验 learnerContext：必须是字符串且不超过长度限制
    let sanitizedLearnerContext: string | undefined
    if (learnerContext !== undefined) {
      if (typeof learnerContext !== 'string') {
        return errorResponse('learnerContext 必须是字符串', 400)
      }
      if (learnerContext.length > MAX_LEARNER_CONTEXT_LENGTH) {
        sanitizedLearnerContext = learnerContext.slice(0, MAX_LEARNER_CONTEXT_LENGTH)
      } else {
        sanitizedLearnerContext = learnerContext
      }
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
    if (userId && db && messages.length > 0) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
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

    const arkStream = await chatCompletionStream(
      context.env,
      { messages: messages as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>, systemPrompt }
    )

    // 双通道：TransformStream 拦截 SSE 流，累积 AI 完整回复
    const decoder = new TextDecoder()
    let fullAiContent = ''
    let lineBuffer = ''

    const { readable, writable } = new TransformStream({
      transform(chunk, controller) {
        // 透传给客户端
        controller.enqueue(chunk)

        // 累积 AI 回复内容（带行缓冲，防止跨 chunk 截断丢数据）
        const text = decoder.decode(chunk, { stream: true })
        const combined = lineBuffer + text
        const lines = combined.split('\n')
        lineBuffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const { d } = JSON.parse(data)
            if (d) fullAiContent += d
          } catch { /* skip malformed */ }
        }
      },
      flush() {
        // 处理残余 buffer
        if (lineBuffer.startsWith('data: ')) {
          const data = lineBuffer.slice(6).trim()
          if (data && data !== '[DONE]') {
            try {
              const { d } = JSON.parse(data)
              if (d) fullAiContent += d
            } catch { /* skip */ }
          }
        }

        // 流结束：解析 META + 合规审计 + 写 D1
        if (userId && db && fullAiContent) {
          const { cleanContent, meta } = parseMetaFromContent(fullAiContent)
          if (cleanContent) {
            // 服务端合规审计
            const audit = auditAiResponse(cleanContent)
            if (!audit.isCompliant) {
              console.warn('[Chat Audit] 合规问题:', audit.issues.join(', '))
            }

            context.waitUntil(
              addMessage(db, crypto.randomUUID(), conversationId, 'assistant', cleanContent, undefined, {
                emotion: meta?.emotion,
                sessionPhase: meta?.session_phase,
                complianceIssues: audit.issues.length > 0 ? audit.issues : undefined,
              }).catch(err => console.error('[Chat D1 写入 AI 回复失败]', err))
            )
          }
        }
      },
    })

    // 将 arkStream pipe 到 TransformStream
    arkStream.pipeTo(writable).catch(() => {})

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '对话处理失败'
    console.error('[Chat]', message)
    return errorResponse(message)
  }
}
