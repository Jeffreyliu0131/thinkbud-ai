import { useRef, useEffect, useCallback } from 'react'
import type { GradeLevel, Subject, EmotionType } from '../types'
import type { ChatAction, ChatState } from '../types/chatState'
import type { useChat } from './useChat'
import { useSTT, useTTS, unlockAudioContext } from './useSpeech'
import { useRTCVoice, prefetchRTCSDK } from './useRTCVoice'
import { computeSessionAnalytics } from '../lib/sessionAnalytics'
import { extractAndSyncKnowledge } from '../lib/knowledgeExtractor'
import { detectSubject } from '../lib/detectSubject'

/** TTS text sanitization: remove META remnants, JSON fragments, braces */
function sanitizeForTTS(text: string): string {
  return text
    .replace(/-{0,3}\s*META\s*-{0,3}[\s\S]*$/i, '')
    .replace(/\{["\s]*emotion[\s\S]*$/i, '')
    .replace(/[{}[\]]/g, '')
    .replace(/---+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** VOI-01: 语音错误 -> 温暖的儿童友好提示 */
function mapRTCErrorToFriendly(msg: string): string {
  if (msg.includes('麦克风') || msg.toLowerCase().includes('mic') || msg.includes('permission')) {
    return '哦，我好像没听到，能让我用一下麦克风吗？'
  }
  if (msg.includes('连接') || msg.includes('network') || msg.toLowerCase().includes('connect')) {
    return '哦，我好像没听清楚，能再说一次吗？'
  }
  if (msg.includes('超时') || msg.includes('timeout')) {
    return '哦，我好像没听清楚，能再说一次吗？'
  }
  // Default: all unknown errors get friendly copy
  return '哦，我好像没听清楚，能再说一次吗？'
}

/** Emotion -> TTS speech rate, grade-differentiated (VOI-03) */
function getEmotionRate(emotion: EmotionType, grade: GradeLevel): number {
  const BASE_RATE: Record<EmotionType, number> = {
    '正常': 1.1,
    '困惑': 0.95,
    '沮丧': 0.9,
    '兴奋': 1.25,
    '自信': 1.15,
    '惊喜': 1.2,
    '好奇': 1.05,
    '困倦': 0.9,
    '专注': 1.0,
  }
  const rate = BASE_RATE[emotion]
  // Lower grade: reduce all rates by 0.1 (slower, warmer)
  return grade === 'lower' ? rate - 0.1 : rate
}

interface UseVoicePipelineParams {
  gradeLevel: GradeLevel
  dispatch: React.Dispatch<ChatAction>
  state: ChatState
  chat: ReturnType<typeof useChat>
  onVoiceResult: (transcript: string) => Promise<void>
  showToast: (msg: string) => void
  /** External conversationRef shared with useChatSession */
  conversationRef: React.MutableRefObject<boolean>
  /** Called before RTC connect to capture camera + OCR; returns OCR text or null */
  onPrepareRTCConnect?: () => Promise<string | null>
  /** 检测到的学科（传入 RTC start 用于 system prompt 构建） */
  subject?: Subject
  /** 学生知识上下文（来自 Phase 11 知识追踪层） */
  knowledgeContext?: string
  /** 用户 ID（用于 RTC 会话结束时触发知识提取, DATA-03） */
  userId?: string
}

export function useVoicePipeline({
  gradeLevel,
  dispatch,
  state,
  chat,
  onVoiceResult,
  showToast,
  conversationRef,
  onPrepareRTCConnect,
  subject,
  knowledgeContext,
  userId,
}: UseVoicePipelineParams) {
  const prevStreamingRef = useRef(false)
  const firstSentenceSpokenRef = useRef('')
  const firstSentencePromiseRef = useRef<Promise<void> | null>(null)
  const rtcConnectingRef = useRef(false)
  const sttRetryCountRef = useRef(0)
  const sttRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectErrorRef = useRef<string | null>(null)

  const stt = useSTT()
  const tts = useTTS()

  // VOICE-02: 预加载 RTC SDK（消除首次点击 2-5s 延迟）
  useEffect(() => { prefetchRTCSDK() }, [])

  // Stable ref for onVoiceResult to avoid stale closures
  const onVoiceResultRef = useRef(onVoiceResult)
  useEffect(() => {
    onVoiceResultRef.current = onVoiceResult
  })

  // Stable refs for RTC session end analytics (避免 cleanup 时 state 已清空)
  const chatMessagesRef = useRef(chat.messages)
  useEffect(() => {
    chatMessagesRef.current = chat.messages
  })
  const subjectRef = useRef(subject)
  useEffect(() => {
    subjectRef.current = subject
  })
  const userIdRef = useRef(userId)
  useEffect(() => {
    userIdRef.current = userId
  })

  // STT auto-listen with retry logic
  // startAutoListen references itself via setTimeout for retry — safe at runtime
  /* eslint-disable react-hooks/immutability */
  const startAutoListen = useCallback(() => {
    dispatch({ type: 'SET_PHASE', phase: 'listening' })
    stt.startListening(
      (text) => {
        sttRetryCountRef.current = 0
        onVoiceResultRef.current(text)
      },
      {
        silenceTimeout: 1000,
        onSilenceDetected: () => {
          dispatch({ type: 'SET_PHASE', phase: 'processing' })
        },
        onEmpty: () => {
          if (!conversationRef.current) {
            dispatch({ type: 'SET_PHASE', phase: 'idle' })
            return
          }
          sttRetryCountRef.current += 1
          if (sttRetryCountRef.current > 3) {
            console.warn('[STT] 录音连续失败，停止重试')
            conversationRef.current = false
            dispatch({ type: 'SET_PHASE', phase: 'idle' })
            showToast(mapRTCErrorToFriendly('麦克风启动失败'))
            return
          }
          sttRetryTimerRef.current = setTimeout(() => startAutoListen(), 300)
        },
      }
    )
  }, [stt, showToast, dispatch, conversationRef])
  /* eslint-enable react-hooks/immutability */

  // RTC Voice Agent hook
  const rtc = useRTCVoice({
    onPhaseChange: (p) => dispatch({ type: 'SET_PHASE', phase: p }),
    onSubtitle: (text, isUser, isFinal) => {
      dispatch({ type: 'SET_RTC_SUBTITLE', text })
      if (isFinal && text.trim()) {
        chat.addMessage({
          id: crypto.randomUUID(),
          role: isUser ? 'user' : 'assistant',
          content: text,
          timestamp: Date.now(),
        })
      }
    },
    onAIFinishSpeaking: () => {
      // AI finished speaking, RTC auto-continues listening
    },
    onError: (errMsg) => {
      if (rtcConnectingRef.current) {
        // 连接期间的错误存起来，由 handleTalkPress 的降级逻辑显示
        connectErrorRef.current = errMsg
      } else {
        // Mid-session RTC error: disconnect, notify user, fall back to STT
        rtc.disconnect()
        dispatch({ type: 'FALLBACK_TO_STT' })
        showToast(mapRTCErrorToFriendly(errMsg) + '，已切换到普通模式')
        startAutoListen()
      }
    },
    onHealthTimeout: () => {
      console.warn('[VoicePipeline] RTC 健康检查超时，降级到传统模式')
      rtc.disconnect()
      dispatch({ type: 'FALLBACK_TO_STT' })
      showToast('语音识别未响应，已切换到普通模式')
      startAutoListen()
    },
    onTimeWarning: (msg) => showToast(msg),
    onTimeLimit: (msg) => {
      showToast(msg)
      dispatch({ type: 'SET_PHASE', phase: 'idle' })
    },
    onSessionEnd: (conversationId: string) => {
      // DATA-01/02/03: RTC 会话结束分析管道（与文字聊天对齐）
      const messages = chatMessagesRef.current
      if (messages.length === 0) return

      // DATA-01: 计算会话分析（per D-02: 使用 chat.messages，缺 emotion 字段是预期行为）
      const analytics = computeSessionAnalytics(messages, false)

      // DATA-02: 检测学科（per D-03: OCR 优先，字幕文本 fallback）
      let sessionSubject = subjectRef.current
      if (!sessionSubject) {
        const allText = messages.map(m => m.content).join(' ')
        sessionSubject = detectSubject(allText)
      }

      // DATA-01 + DATA-02: 上报分析数据 + 学科到 D1（fire-and-forget）
      fetch('/api/end-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          subject: sessionSubject,
          analytics: {
            resolutionType: analytics.resolutionType,
            emotionTrajectory: analytics.emotionArc.length > 0 ? analytics.emotionArc : undefined,
            strategiesUsed: analytics.strategiesUsed.length > 0 ? analytics.strategiesUsed : undefined,
            hintCount: analytics.hintCount,
            struggleDuration: analytics.struggleDuration,
          },
        }),
      }).catch(err => console.warn('[RTC EndConversation] 上报失败:', err))

      // DATA-03: 触发知识点提取（fire-and-forget, per D-03）
      const uid = userIdRef.current
      if (sessionSubject && uid) {
        const msgs = messages.map(m => ({ role: m.role, content: m.content }))
        extractAndSyncKnowledge({ messages: msgs, subject: sessionSubject, userId: uid })
          .catch(() => {}) // 静默失败，知识提取非关键路径
      }
    },
  })

  // First-sentence streaming TTS callback
  // Mutating external ref is intentional for cross-hook communication
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    chat.onFirstSentenceRef.current = (sentence: string) => {
      firstSentenceSpokenRef.current = sentence
      dispatch({ type: 'SET_PHASE', phase: 'speaking' })
      const rate = getEmotionRate('正常', gradeLevel)
      firstSentencePromiseRef.current = tts.speak(sanitizeForTTS(sentence), { rate })
    }
    return () => { chat.onFirstSentenceRef.current = null }
  })
  /* eslint-enable react-hooks/immutability */

  // Auto-TTS: after streaming ends, speak remaining text
  useEffect(() => {
    if (prevStreamingRef.current && !chat.isStreaming) {
      const lastMsg = chat.messages[chat.messages.length - 1]
      if (lastMsg?.role === 'assistant' && lastMsg.content) {
        const ttsRate = getEmotionRate(lastMsg.emotion ?? '正常', gradeLevel)
        const alreadySpoken = firstSentenceSpokenRef.current
        firstSentenceSpokenRef.current = ''

        let remaining = lastMsg.content
        if (alreadySpoken && remaining.startsWith(alreadySpoken)) {
          remaining = remaining.substring(alreadySpoken.length).trim()
        }

        const afterTTS = () => {
          if (lastMsg.sessionPhase === 'session_complete') {
            dispatch({ type: 'SET_PHASE', phase: 'idle' })
            return
          }
          if (conversationRef.current) {
            startAutoListen()
          } else {
            dispatch({ type: 'SET_PHASE', phase: 'idle' })
          }
        }

        if (remaining) {
          const speakRemaining = () => {
            dispatch({ type: 'SET_PHASE', phase: 'speaking' })
            tts.speak(sanitizeForTTS(remaining), { rate: ttsRate }).then(afterTTS).catch(afterTTS)
          }
          if (firstSentencePromiseRef.current) {
            firstSentencePromiseRef.current.then(speakRemaining).catch(speakRemaining)
            firstSentencePromiseRef.current = null
          } else {
            speakRemaining()
          }
        } else if (alreadySpoken) {
          if (firstSentencePromiseRef.current) {
            firstSentencePromiseRef.current.then(afterTTS).catch(afterTTS)
            firstSentencePromiseRef.current = null
          } else {
            afterTTS()
          }
        } else {
          dispatch({ type: 'SET_PHASE', phase: 'speaking' })
          tts.speak(sanitizeForTTS(lastMsg.content), { rate: ttsRate }).then(afterTTS).catch(afterTTS)
        }
      } else {
        if (conversationRef.current) {
          startAutoListen()
        } else {
          dispatch({ type: 'SET_PHASE', phase: 'idle' })
        }
      }
    }
    prevStreamingRef.current = chat.isStreaming
  }, [chat.isStreaming, chat.messages, tts, gradeLevel, startAutoListen, dispatch, conversationRef])

  // Main talk button handler
  const handleTalkPress = useCallback(async () => {
    unlockAudioContext()

    if (state.useRTC && !rtc.isConnected && state.phase === 'idle') {
      // RTC mode: first tap connects
      conversationRef.current = true
      dispatch({ type: 'SET_PHASE', phase: 'connecting' })
      rtcConnectingRef.current = true

      // OCR: 完整等待识别完成后再连接 RTC，确保题目信息传入 LLM
      let ocrText: string | undefined
      if (onPrepareRTCConnect) {
        try {
          const result = await onPrepareRTCConnect()
          if (result) ocrText = result
        } catch {
          // OCR failed, continue without it
        }
      }

      connectErrorRef.current = null
      const success = await rtc.connect({ gradeLevel, ocrText, subject, knowledgeContext })
      rtcConnectingRef.current = false
      if (!success) {
        const errDetail = connectErrorRef.current || rtc.error || '未知错误'
        console.warn('[VoicePipeline] RTC 连接失败，降级到传统模式:', errDetail)
        // 如果是使用时长限制，直接显示友好文案，不降级
        if (errDetail.includes('学了不少') || errDetail.includes('明天再来')) {
          showToast(errDetail)
          dispatch({ type: 'SET_PHASE', phase: 'idle' })
          conversationRef.current = false
        } else {
          dispatch({ type: 'FALLBACK_TO_STT' })
          showToast(`语音连接失败，已切换到普通模式`)
          startAutoListen()
        }
      }
      return
    }

    if (state.useRTC && rtc.isConnected) {
      // RTC mode: button disconnects (exit path for user)
      if (state.phase !== 'idle') {
        conversationRef.current = false
        rtc.disconnect()
      }
      return
    }

    // Legacy STT mode (fallback)
    if (state.phase === 'listening') {
      if (sttRetryTimerRef.current) {
        clearTimeout(sttRetryTimerRef.current)
        sttRetryTimerRef.current = null
      }
      conversationRef.current = false
      stt.stopListening()
      dispatch({ type: 'SET_PHASE', phase: 'idle' })
    } else if (state.phase === 'speaking') {
      tts.stop()
      if (conversationRef.current) {
        startAutoListen()
      } else {
        dispatch({ type: 'SET_PHASE', phase: 'idle' })
      }
    } else if (state.phase === 'idle') {
      conversationRef.current = true
      startAutoListen()
    }
  }, [state.useRTC, state.phase, rtc, gradeLevel, subject, knowledgeContext, stt, tts, startAutoListen, dispatch, showToast, conversationRef, onPrepareRTCConnect])

  return {
    handleTalkPress,
    rtc,
    stt,
    tts,
    sttRetryTimerRef,
    startAutoListen,
  }
}
