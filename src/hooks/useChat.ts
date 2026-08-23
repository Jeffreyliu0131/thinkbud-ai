import { useState, useCallback, useRef } from 'react'
import type { GradeLevel, Subject, ChatMessage, EmotionType, SessionPhase } from '../types'
import { fetchWithTimeout } from '../lib/api'
import { auditAiResponse } from '../lib/auditAi'

interface MetaData {
  emotion: EmotionType
  thinking_node: string
  session_phase?: SessionPhase
}

/* ---- 上下文窗口管理 ---- */
const MAX_CONTEXT_MESSAGES = 20
const ALWAYS_KEEP_FIRST = 2 // 保留前 2 条（OCR 上下文 + 首次 AI 回复）

export function trimToContextWindow(
  messages: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  if (messages.length <= MAX_CONTEXT_MESSAGES) return messages

  const head = messages.slice(0, ALWAYS_KEEP_FIRST)
  const tail = messages.slice(-(MAX_CONTEXT_MESSAGES - ALWAYS_KEEP_FIRST))
  const gapMarker = {
    role: 'user' as const,
    content: '[...前面的对话已省略，请根据最近的对话继续引导...]',
  }
  return [...head, gapMarker, ...tail]
}

export function parseMetaFromContent(content: string): {
  cleanContent: string
  meta: MetaData | null
} {
  // 容错：DeepSeek 经常输出残缺 META 分隔符（M---、ETA---、--META-- 等）
  const metaPattern = /-{0,3}\s*META\s*-{0,3}/
  const match = content.match(metaPattern)

  if (!match || match.index === undefined) {
    // 兜底：如果正文末尾残留裸 JSON（{"emotion...），也清除
    const jsonTrail = content.match(/\s*\{["\s]*emotion[\s\S]*$/)
    if (jsonTrail && jsonTrail.index !== undefined) {
      return { cleanContent: content.substring(0, jsonTrail.index).trim(), meta: null }
    }
    return { cleanContent: content, meta: null }
  }

  const cleanContent = content.substring(0, match.index).trim()
  const metaStr = content.substring(match.index + match[0].length).trim()

  try {
    // 尝试修复常见 JSON 畸形：缺逗号、key 无引号等
    let fixed = metaStr
    if (!fixed.startsWith('{')) {
      const braceIdx = fixed.indexOf('{')
      fixed = braceIdx >= 0 ? fixed.substring(braceIdx) : '{' + fixed
    }
    if (!fixed.endsWith('}')) {
      const lastBrace = fixed.lastIndexOf('}')
      fixed = lastBrace >= 0 ? fixed.substring(0, lastBrace + 1) : fixed + '}'
    }
    // key 无引号: {emotion: → {"emotion":
    fixed = fixed.replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":')
    // value 无引号且非对象: :"正常" 保持，:正常 → :"正常"
    fixed = fixed.replace(/:([^"{}[\],\s][^,}]*)/g, (_, v) => ':"' + v.trim() + '"')

    const meta = JSON.parse(fixed) as MetaData
    return { cleanContent, meta }
  } catch {
    // JSON 解析彻底失败，至少保证正文干净
    return { cleanContent, meta: null }
  }
}

/** 中文句子边界：句号、问号、感叹号、省略号 */
const SENTENCE_END_RE = /[。？！…]+/

/** META 分隔符 pattern（用于流式显示时剥离） */
const META_SPLIT_RE = /-{0,3}\s*META\s*-{0,3}/

export function useChat(
  gradeLevel: GradeLevel,
  sessionId?: string,
  subject?: Subject,
  knowledgeContext?: string,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  /** 流式分句回调：第一个完整句子就绪时触发（仅触发一次） */
  const onFirstSentenceRef = useRef<((sentence: string) => void) | null>(null)

  // 用 ref 始终持有最新 messages，避免 useCallback 闭包陈旧
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const sendMessage = useCallback(
    async (userContent: string, existingMessages?: ChatMessage[], inputMethod?: string) => {
      const currentMessages = existingMessages ?? messagesRef.current

      // 防重复：如果已在 streaming，忽略
      if (abortRef.current) return

      setError(null)

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userContent,
        timestamp: Date.now(),
      }

      const updatedMessages = [...currentMessages, userMsg]
      setMessages(updatedMessages)

      // Prepare API messages: strip metadata fields + 滑动窗口截断
      const rawApiMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
      const apiMessages = trimToContextWindow(rawApiMessages)

      const assistantId = crypto.randomUUID()
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }

      setMessages((prev) => [...prev, assistantMsg])
      setIsStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      // 总超时：覆盖 headers + streaming body 全过程（fetchWithTimeout 的超时只保护到 headers）
      let didTimeout = false
      const overallTimer = setTimeout(() => { didTimeout = true; controller.abort() }, 45_000)

      try {
        // 只传 gradeLevel，服务端构建 system prompt
        // knowledgeContext 注入学生知识状态（来自 Phase 11 知识追踪层）
        const res = await fetchWithTimeout('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            gradeLevel,
            sessionId,
            inputMethod,
            ...(subject ? { subject } : {}),
            ...(knowledgeContext ? { learnerContext: knowledgeContext } : {}),
          }),
          signal: controller.signal,
          timeout: 30_000,
        })

        if (!res.ok) {
          throw new Error(await res.text())
        }

        if (!res.body) {
          throw new Error('响应没有数据流')
        }

        // 流式读取 SSE
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let fullContent = ''
        let lineBuffer = ''
        let firstSentenceFired = false

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const text = lineBuffer + chunk
          const lines = text.split('\n')
          lineBuffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            try {
              const { d } = JSON.parse(data)
              if (d) {
                fullContent += d

                // 流式显示：剥离 META 部分
                const display = fullContent.split(META_SPLIT_RE)[0].trim()
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: display } : m
                  )
                )

                // 首句回调（用于 TTS 提前朗读）
                // 策略：句末标点优先；超过 15 字仍无标点时按逗号/顿号切分；
                //       超过 25 字无任何切分点时强制触发
                if (!firstSentenceFired && onFirstSentenceRef.current) {
                  let triggerText = ''
                  const sentenceMatch = display.match(SENTENCE_END_RE)
                  if (sentenceMatch && sentenceMatch.index !== undefined) {
                    const endPos = sentenceMatch.index + sentenceMatch[0].length
                    triggerText = display.substring(0, endPos).trim()
                  } else if (display.length >= 15) {
                    // 没有句末标点但已积累 15+ 字，尝试按逗号/顿号切
                    const commaMatch = display.match(/[，、：]+/)
                    if (commaMatch && commaMatch.index !== undefined && commaMatch.index >= 4) {
                      triggerText = display.substring(0, commaMatch.index + commaMatch[0].length).trim()
                    } else if (display.length >= 25) {
                      // 25 字强制触发
                      triggerText = display.trim()
                    }
                  }
                  if (triggerText.length >= 2) {
                    onFirstSentenceRef.current(triggerText)
                    firstSentenceFired = true
                  }
                }
              }
            } catch { /* skip malformed chunks */ }
          }
        }

        // 流结束：没有句号的短回复也触发首句回调
        if (!firstSentenceFired && onFirstSentenceRef.current && fullContent) {
          const textBeforeMeta = fullContent.split(META_SPLIT_RE)[0].trim()
          if (textBeforeMeta.length >= 2) {
            onFirstSentenceRef.current(textBeforeMeta)
          }
        }

        // 最终解析 META + 合规审计
        const { cleanContent, meta } = parseMetaFromContent(fullContent)
        const audit = auditAiResponse(cleanContent)
        if (!audit.isCompliant) {
          console.warn('[AI合规审计] 问题:', audit.issues.join(', '), '| 内容:', cleanContent.substring(0, 80))
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: cleanContent,
                  emotion: meta?.emotion,
                  thinkingNode: meta?.thinking_node,
                  sessionPhase: meta?.session_phase,
                  complianceIssues: audit.issues.length > 0 ? audit.issues : undefined,
                }
              : m
          )
        )
      } catch (err) {
        // 用户手动停止（非超时）→ 静默退出
        if ((err as Error).name === 'AbortError' && !didTimeout) return

        const errMessage = didTimeout
          ? 'AI 回复超时，请再试一次'
          : '连接中断，请重新发送消息'
        setError(errMessage)

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  // Keep partial content if any was streamed; only show error text if empty
                  content: m.content?.trim()
                    ? m.content + '\n\n[' + errMessage + ']'
                    : errMessage,
                }
              : m
          )
        )
        console.error('Chat error:', err)
      } finally {
        clearTimeout(overallTimer)
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [gradeLevel, sessionId, subject, knowledgeContext]
  )

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg])
  }, [])

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    messages,
    setMessages,
    isStreaming,
    error,
    sendMessage,
    addMessage,
    stopStreaming,
    onFirstSentenceRef,
  }
}
