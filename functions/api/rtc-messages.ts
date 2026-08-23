// POST /api/rtc-messages — 批量写入 RTC 字幕消息到 D1 (STAB-04)
// 客户端缓冲字幕数据，定期或断开时 POST 到此端点
// 复用 conversations + messages 表（与 STT 管道对齐）

import type { AppEnv, ContextData } from '../_shared/env'
import { ensureConversation, addMessage } from '../_shared/db'
import { jsonResponse, errorResponse } from '../_shared/utils/response'
import { auditAiResponse } from '../_shared/audit'

interface RTCMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  emotion?: string
  sessionPhase?: string
  complianceIssues?: string[]
}

interface RTCMessagesRequest {
  conversationId: string
  messages: RTCMessage[]
}

export const onRequestPost: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const userId = context.data.userId
    if (!userId) {
      return errorResponse('未登录', 401)
    }

    const { conversationId, messages }: RTCMessagesRequest = await context.request.json()

    if (!conversationId || !Array.isArray(messages) || messages.length === 0) {
      return errorResponse('参数格式错误：需要 conversationId 和非空 messages 数组', 400)
    }

    // 限制单次批量大小，防止滥用
    if (messages.length > 100) {
      return errorResponse('单次最多 100 条消息', 400)
    }

    const db = context.env.DB

    // 使用 waitUntil 异步写入（不阻塞响应）
    context.waitUntil(
      (async () => {
        try {
          // 验证对话所有权：如果对话已存在，必须属于当前用户
          const existing = await db.prepare(
            `SELECT user_id FROM conversations WHERE id = ?`
          ).bind(conversationId).first<{ user_id: string }>()
          if (existing && existing.user_id !== userId) {
            console.error('[RTC Messages] 对话所有权校验失败:', conversationId)
            return
          }

          await ensureConversation(db, conversationId, userId)

          for (const msg of messages) {
            if (!msg.content || !msg.role) continue
            if (msg.role !== 'user' && msg.role !== 'assistant') continue

            // 服务端合规审计（AI 消息）
            let complianceIssues = msg.complianceIssues
            if (msg.role === 'assistant' && !complianceIssues) {
              const audit = auditAiResponse(msg.content)
              if (!audit.isCompliant) {
                complianceIssues = audit.issues
              }
            }

            await addMessage(
              db,
              crypto.randomUUID(),
              conversationId,
              msg.role,
              msg.content,
              'rtc',
              {
                emotion: msg.emotion,
                sessionPhase: msg.sessionPhase,
                complianceIssues,
              }
            )
          }
        } catch (err) {
          console.error('[RTC Messages D1 写入失败]', err)
        }
      })()
    )

    return jsonResponse({ success: true, count: messages.length })
  } catch (err) {
    console.error('[RTC Messages]', err)
    return errorResponse('消息保存失败')
  }
}
