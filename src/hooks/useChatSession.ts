import { useRef, useEffect, useCallback, useState } from 'react'
import type { GradeLevel, Subject, StudentMood } from '../types'
import type { ChatAction, ChatState } from '../types/chatState'
import type { useChat } from './useChat'
import type { useCamera } from './useCamera'
import { recognizeImage } from '../lib/api'
import { getSession } from '../lib/db'
import { useStorage } from './useStorage'
import { useToast } from '../components/Toast'
import { extractAndSyncKnowledge } from '../lib/knowledgeExtractor'
import { sanitizeOcrText } from '../lib/inputSafety'

// Keep the historical import path stable for existing callers and tests.
export { sanitizeOcrText } from '../lib/inputSafety'

/**
 * OCR result validation: filter out noise from non-question captures
 * (e.g. faces, desktops)
 */
export function isValidOcrResult(text: string): boolean {
  if (!text || text.trim().length < 3) return false
  // 数学：数字+运算符/关键词
  const hasDigit = /\d/.test(text)
  const hasMathSign = /[+\-\u00d7\u00f7=\uff0b\uff0d\u00d7\u00f7\uff1d%()（）]/.test(text)
  const hasMathKeyword = /[求多少几等于加减乘除比较大小]/.test(text)
  if (hasDigit && (hasMathSign || hasMathKeyword)) return true
  // 语文/英语：至少5个中文字或英文单词
  const hasChinese = (text.match(/[\u4e00-\u9fff]/g) || []).length >= 5
  const hasEnglish = (text.match(/[a-zA-Z]+/g) || []).length >= 3
  return hasChinese || hasEnglish
}

/** Completion detection keywords: AI reply containing these + positive emotion -> session_complete */
const COMPLETION_KEYWORDS = ['做对了', '完全正确', '很棒', '太厉害', '答对了', '掌握了', '理解得很好', '没问题']

/** Mood button -> AI context message */
const MOOD_MESSAGES: Record<StudentMood, string> = {
  happy: '[学生表示心情不错，感觉开心]',
  confused: '[学生表示有点迷糊，需要帮助]',
  frustrated: '[学生表示有点烦躁，请先安抚情绪再继续引导]',
}

/** Deduplicated variant prompt (ARCH-05) — used by both voice "搞懂了" and button click */
const VARIANT_PROMPT = '[学生表示已经搞懂了。请按以下规则验证：1）生成一个同类型、同策略但数字有实质差异的变式题（不能只改个位数）；2）难度与原题相当，不超纲；3）变式题的META加 session_phase: "variant_asked"；4）学生答对并描述思路后，做元认知小结（"你刚才是怎么想通的？"），小结完成后META加 session_phase: "session_complete"。]'

interface UseChatSessionParams {
  gradeLevel: GradeLevel
  sessionId: string
  resumeSessionId?: string
  chat: ReturnType<typeof useChat>
  camera: ReturnType<typeof useCamera>
  dispatch: React.Dispatch<ChatAction>
  state: ChatState
  /** 检测到的学科（来自 OCR 或外部传入） */
  subject?: Subject
  /** 当前登录用户 ID（用于知识追踪 IndexedDB 读写） */
  userId?: string
}

export function useChatSession({
  gradeLevel,
  sessionId,
  resumeSessionId,
  chat,
  camera,
  dispatch,
  state,
  subject,
  userId,
}: UseChatSessionParams) {
  const { showToast } = useToast()
  const hasOcrRef = useRef(false)
  const ocrTextRef = useRef<string | null>(null)
  const conversationRef = useRef(false)
  const sessionStartTime = useRef(Date.now())


  const { markResolved } = useStorage(sessionId, gradeLevel, chat.messages, state.imageUrl, state.ocrText)

  // 会话完成时触发知识提取（fire-and-forget，非关键路径）
  const triggerKnowledgeExtraction = useCallback(() => {
    if (!subject || !userId || chat.messages.length === 0) return
    const msgs = chat.messages.map(m => ({ role: m.role, content: m.content }))
    extractAndSyncKnowledge({ messages: msgs, subject, userId })
      .catch(() => {}) // 静默失败，不阻塞 UI
  }, [subject, userId, chat.messages])

  // Session completion detection
  useEffect(() => {
    if (state.sessionPhase === 'completed') return
    const lastMsg = chat.messages[chat.messages.length - 1]
    if (!lastMsg || lastMsg.role !== 'assistant' || chat.isStreaming) return

    // Method 1: AI explicitly returns session_phase
    if (lastMsg.sessionPhase === 'session_complete') {
      dispatch({ type: 'COMPLETE_SESSION' })
      conversationRef.current = false
      markResolved().catch(console.error)
      triggerKnowledgeExtraction()
      return
    }

    // Method 2: fallback — in variant phase, AI uses positive keywords + positive emotion
    if (
      state.sessionPhase === 'variant' &&
      (lastMsg.emotion === '兴奋' || lastMsg.emotion === '自信') &&
      COMPLETION_KEYWORDS.some((kw) => lastMsg.content.includes(kw))
    ) {
      dispatch({ type: 'COMPLETE_SESSION' })
      conversationRef.current = false
      markResolved().catch(console.error)
      triggerKnowledgeExtraction()
    }
  }, [chat.messages, chat.isStreaming, state.sessionPhase, markResolved, dispatch, triggerKnowledgeExtraction])

  // Session resume
  useEffect(() => {
    if (!resumeSessionId) return
    getSession(resumeSessionId).then((session) => {
      if (session) {
        chat.setMessages(session.messages)
        if (session.imageUrl) dispatch({ type: 'SET_IMAGE', imageUrl: session.imageUrl })
        if (session.ocrText) {
          const sanitizedOcr = sanitizeOcrText(session.ocrText)
          hasOcrRef.current = true
          ocrTextRef.current = sanitizedOcr
          dispatch({ type: 'SET_OCR', ocrText: sanitizedOcr })
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeSessionId])

  // Voice result handler (called by voice pipeline when STT produces text)
  const handleVoiceResult = useCallback(async (transcript: string) => {
    dispatch({ type: 'SET_PHASE', phase: 'processing' })

    // Detect "搞懂了" voice command
    if (transcript.includes('搞懂了') && chat.messages.length >= 4 && state.sessionPhase === 'active') {
      dispatch({ type: 'SET_SESSION_PHASE', sessionPhase: 'variant' })
      conversationRef.current = true
      chat.sendMessage(VARIANT_PROMPT)
      return
    }

    if (!hasOcrRef.current) {
      // First interaction: try capture + OCR, fallback to oral
      const dataUrl = camera.capture()
      if (dataUrl) {
        try {
          const ocrResult = await recognizeImage(dataUrl)

          if (isValidOcrResult(ocrResult)) {
            dispatch({ type: 'SET_IMAGE', imageUrl: dataUrl })
            const sanitizedOcr = sanitizeOcrText(ocrResult)
            dispatch({ type: 'SET_OCR', ocrText: sanitizedOcr })
            ocrTextRef.current = sanitizedOcr
            hasOcrRef.current = true

            const combinedContent = `[学生拍了一道题，OCR识别结果如下]\n${sanitizedOcr}\n\n[学生说] ${transcript}`
            chat.sendMessage(combinedContent)
          } else {
            showToast(`[调试] OCR返回但验证失败: "${ocrResult.slice(0, 50)}"`)
            hasOcrRef.current = true
            chat.sendMessage(transcript)
          }
        } catch (err) {
          showToast(`[调试] OCR请求失败: ${err instanceof Error ? err.message : '未知错误'}`)
          hasOcrRef.current = true
          chat.sendMessage(transcript)
        }
      } else {
        showToast('[调试] 截帧失败: capture()返回null')
        hasOcrRef.current = true
        chat.sendMessage(transcript)
      }
    } else {
      chat.sendMessage(transcript)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.messages.length, state.sessionPhase, camera, chat, dispatch, showToast])

  // "搞懂了" button handler
  const handleGotIt = useCallback(() => {
    dispatch({ type: 'SET_PHASE', phase: 'processing' })
    dispatch({ type: 'SET_SESSION_PHASE', sessionPhase: 'variant' })
    conversationRef.current = true
    chat.sendMessage(VARIANT_PROMPT)
  }, [chat, dispatch])

  // Mood selection handler
  const handleMoodSelect = useCallback((mood: StudentMood) => {
    conversationRef.current = true
    dispatch({ type: 'SET_PHASE', phase: 'processing' })
    chat.sendMessage(MOOD_MESSAGES[mood])
  }, [chat, dispatch])

  // Switch problem handler
  const handleSwitchProblem = useCallback(() => {
    hasOcrRef.current = false
    ocrTextRef.current = null
    dispatch({ type: 'SWITCH_PROBLEM' })
  }, [dispatch])

  // Manual capture handler: 用户主动点"拍题"按钮
  const [isOcrLoading, setIsOcrLoading] = useState(false)

  const handleCapture = useCallback(async () => {
    const dataUrl = camera.capture()
    if (!dataUrl) {
      showToast('截帧失败，请重新对准后再试')
      return
    }

    // 立刻显示截帧
    dispatch({ type: 'SET_IMAGE', imageUrl: dataUrl })
    setIsOcrLoading(true)

    try {
      const ocrResult = await recognizeImage(dataUrl)

      if (isValidOcrResult(ocrResult)) {
        const sanitizedOcr = sanitizeOcrText(ocrResult)
        dispatch({ type: 'SET_OCR', ocrText: sanitizedOcr })
        ocrTextRef.current = sanitizedOcr
        hasOcrRef.current = true
      } else {
        // OCR 返回但内容不像题目 → 清除截帧，让用户重新拍
        dispatch({ type: 'SET_IMAGE', imageUrl: null })
        showToast('没识别到题目，请对准作业后重新拍')
      }
    } catch (err) {
      dispatch({ type: 'SET_IMAGE', imageUrl: null })
      showToast(`识别失败: ${err instanceof Error ? err.message : '请重试'}`)
    } finally {
      setIsOcrLoading(false)
    }
  }, [camera, dispatch, showToast])

  // Prepare OCR for RTC connect: capture camera + run OCR, return text or null
  const prepareRTCConnect = useCallback(async (): Promise<string | null> => {
    if (hasOcrRef.current) return ocrTextRef.current

    const dataUrl = camera.capture()
    if (!dataUrl) {
      console.warn('[OCR] 截帧失败: capture()返回null')
      hasOcrRef.current = true
      return null
    }

    try {
      const ocrResult = await recognizeImage(dataUrl)

      if (isValidOcrResult(ocrResult)) {
        const sanitizedOcr = sanitizeOcrText(ocrResult)
        // 自动截帧不锁定画面（不 SET_IMAGE），摄像头继续实时预览
        dispatch({ type: 'SET_OCR', ocrText: sanitizedOcr })
        ocrTextRef.current = sanitizedOcr
        hasOcrRef.current = true
        return sanitizedOcr
      } else {
        console.log('[OCR] 未检测到数学题，跳过')
        hasOcrRef.current = true
        return null
      }
    } catch (err) {
      console.warn('[OCR] 请求失败，跳过:', err)
      hasOcrRef.current = true
      return null
    }
  }, [camera, dispatch])

  const showGotIt = !chat.isStreaming && chat.messages.length >= 4 && state.phase === 'idle' && state.sessionPhase === 'active'

  return {
    handleVoiceResult,
    handleGotIt,
    handleMoodSelect,
    handleSwitchProblem,
    handleCapture,
    isOcrLoading,
    prepareRTCConnect,
    showGotIt,
    markResolved,
    sessionStartTime: sessionStartTime.current,
    conversationRef,
    hasOcrRef,
  }
}
