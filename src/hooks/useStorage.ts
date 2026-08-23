import { useCallback, useEffect, useRef } from 'react'
import type { Session, ChatMessage, GradeLevel } from '../types'
import { saveSession } from '../lib/db'
import { computeSessionAnalytics } from '../lib/sessionAnalytics'
import { updateProfileFromSession } from '../lib/learnerMemory'

export function useStorage(
  sessionId: string,
  gradeLevel: GradeLevel,
  messages: ChatMessage[],
  imageUrl: string | null,
  ocrText: string | null
) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Auto-save with debounce when messages change
  useEffect(() => {
    if (messages.length === 0) return

    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      const session: Session = {
        id: sessionId,
        gradeLevel,
        ocrText: ocrText ?? undefined,
        imageUrl: imageUrl ?? undefined,
        messages,
        resolved: false,
        createdAt: messages[0]?.timestamp ?? Date.now(),
        updatedAt: Date.now(),
        analytics: computeSessionAnalytics(messages, false),
      }
      saveSession(session).catch(console.error)
    }, 1000)

    return () => clearTimeout(saveTimeoutRef.current)
  }, [sessionId, gradeLevel, messages, imageUrl, ocrText])

  const markResolved = useCallback(async () => {
    if (messages.length === 0) return
    const analytics = computeSessionAnalytics(messages, true)
    const session: Session = {
      id: sessionId,
      gradeLevel,
      ocrText: ocrText ?? undefined,
      imageUrl: imageUrl ?? undefined,
      messages,
      resolved: true,
      completedAt: Date.now(),
      createdAt: messages[0]?.timestamp ?? Date.now(),
      updatedAt: Date.now(),
      analytics,
    }
    await saveSession(session)
    // 更新学生画像
    updateProfileFromSession(session).catch(console.error)

    // 上报会话分析到 D1
    const allAuditIssues = messages
      .filter(m => m.complianceIssues && m.complianceIssues.length > 0)
      .flatMap(m => m.complianceIssues!)
    const uniqueAuditFlags = [...new Set(allAuditIssues)]

    fetch('/api/end-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: sessionId,
        auditFlags: uniqueAuditFlags.length > 0 ? uniqueAuditFlags : undefined,
        analytics: {
          resolutionType: analytics.resolutionType,
          emotionTrajectory: analytics.emotionArc.length > 0 ? analytics.emotionArc : undefined,
          ocrText: ocrText ?? undefined,
          strategiesUsed: analytics.strategiesUsed.length > 0 ? analytics.strategiesUsed : undefined,
          hintCount: analytics.hintCount,
          struggleDuration: analytics.struggleDuration,
        },
      }),
    }).catch(err => console.warn('[EndConversation] 上报失败:', err))
  }, [sessionId, gradeLevel, messages, imageUrl, ocrText])

  return { markResolved }
}
