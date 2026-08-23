import { useReducer, useEffect, useMemo, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { GradeLevel } from '../types'
import { chatReducer, INITIAL_CHAT_STATE } from '../types/chatState'
import { useAuth } from '../contexts/AuthContext'
import { useChat } from '../hooks/useChat'
import { useCamera } from '../hooks/useCamera'
import { useChatSession } from '../hooks/useChatSession'
import { useVoicePipeline } from '../hooks/useVoicePipeline'
import { useToast } from '../components/Toast'
import BudMascot from '../components/BudMascot'
import AiCoachOrb from '../components/chat/AiCoachOrb'
import CameraPreview from '../components/chat/CameraPreview'
import ControlBar from '../components/chat/ControlBar'
import CompletionCard from '../components/CompletionCard'
import { buildKnowledgeContext } from '../lib/knowledgeGraph'
import { detectSubject } from '../lib/detectSubject'

export default function ChatPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { user } = useAuth()
  const locationState = location.state as { gradeLevel?: GradeLevel; resumeSessionId?: string } | null
  const gradeLevel = locationState?.gradeLevel || (() => {
    try {
      const saved = localStorage.getItem('thinkbud_grade')
      return saved === 'lower' || saved === 'upper' ? saved as GradeLevel : undefined
    } catch { return undefined }
  })()
  const resumeSessionId = locationState?.resumeSessionId

  const [state, dispatch] = useReducer(chatReducer, INITIAL_CHAT_STATE)
  const sessionId = useMemo(() => resumeSessionId || crypto.randomUUID(), [resumeSessionId])

  // 从 OCR 文本推断学科（用于知识追踪分桶和 AI prompt 个性化）
  const subject = useMemo(() => detectSubject(state.ocrText), [state.ocrText])
  const userId = user?.id

  // 异步加载知识上下文：subject + userId 确定后从 IndexedDB 读取
  // 直接在 ChatPage 管理，以便同时注入 useChat（文字对话）和 useVoicePipeline（RTC 语音）
  // First-time guidance: show BudMascot speech bubble for new users
  const [showGuide, setShowGuide] = useState(() => {
    try { return !localStorage.getItem('thinkbud_chat_guided') }
    catch { return true }
  })

  const [knowledgeContext, setKnowledgeContext] = useState<string | undefined>(undefined)
  const knowledgeLoadedForSubjectRef = useMemo(() => ({ value: '' }), [])
  useEffect(() => {
    if (!subject || !userId) return
    const key = `${userId}:${subject}`
    if (knowledgeLoadedForSubjectRef.value === key) return
    knowledgeLoadedForSubjectRef.value = key
    buildKnowledgeContext(subject, userId)
      .then(ctx => { if (ctx) setKnowledgeContext(ctx) })
      .catch(() => {
        // 静默失败，知识注入是非关键路径
      })
  }, [subject, userId, knowledgeLoadedForSubjectRef])

  // First-time guidance: auto-dismiss after 8 seconds
  useEffect(() => {
    if (!showGuide) return
    const timer = setTimeout(() => {
      setShowGuide(false)
      try { localStorage.setItem('thinkbud_chat_guided', '1') } catch {
        // localStorage 在部分隐私模式下不可用，不影响引导关闭
      }
    }, 8000)
    return () => clearTimeout(timer)
  }, [showGuide])

  const dismissGuide = useCallback(() => {
    setShowGuide(false)
    try { localStorage.setItem('thinkbud_chat_guided', '1') } catch {
      // localStorage 在部分隐私模式下不可用，不影响引导关闭
    }
  }, [])

  const chat = useChat(gradeLevel ?? 'upper', sessionId, subject, knowledgeContext)
  const camera = useCamera()

  const session = useChatSession({
    gradeLevel: gradeLevel ?? 'upper',
    sessionId,
    resumeSessionId,
    chat,
    camera,
    dispatch,
    state,
    subject,
    userId,
  })

  const voice = useVoicePipeline({
    gradeLevel: gradeLevel ?? 'upper',
    dispatch,
    state,
    chat,
    onVoiceResult: session.handleVoiceResult,
    showToast,
    conversationRef: session.conversationRef,
    onPrepareRTCConnect: session.prepareRTCConnect,
    subject,
    knowledgeContext,
    userId: user?.id,
  })

  // Dismiss first-time guidance when phase changes (avoid overlap with Scene 2/3 mascots)
  useEffect(() => {
    if (state.phase !== 'idle' && showGuide) dismissGuide()
  }, [state.phase, showGuide, dismissGuide])

  // Route guard
  useEffect(() => {
    if (!gradeLevel) {
      navigate('/', { replace: true })
    }
  }, [gradeLevel, navigate])

  // Camera auto-open
  useEffect(() => {
    camera.open()
    return () => camera.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wake lock (keep screen on, re-acquire on visibility change)
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null
    let released = false

    const requestWakeLock = async () => {
      if (released) return
      try {
        wakeLock = await navigator.wakeLock.request('screen')
        wakeLock.addEventListener('release', () => {
          wakeLock = null
        })
      } catch {
        console.warn('[WakeLock] 无法保持屏幕常亮')
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !wakeLock) {
        requestWakeLock()
      }
    }

    requestWakeLock()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      released = true
      wakeLock?.release()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // Chat error toast
  useEffect(() => {
    if (chat.error) {
      showToast(chat.error)
    }
  }, [chat.error, showToast])

  // Latest AI emotion for orb
  const lastEmotion = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === 'assistant' && chat.messages[i].emotion) {
        return chat.messages[i].emotion
      }
    }
    return undefined
  }, [chat.messages])

  // Detect 2+ consecutive frustrated/confused AI-detected emotions (Scene 3 trigger)
  const isStuck = useMemo(() => {
    const recent = chat.messages.filter(m => m.role === 'assistant' && m.emotion).slice(-2)
    if (recent.length < 2) return false
    return recent.every(m => m.emotion === '困惑' || m.emotion === '沮丧')
  }, [chat.messages])

  if (!gradeLevel) {
    return null
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--color-bg-primary)] flex flex-col page-enter-left">
      {/* Decorative background */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-teal-200/[0.08] blur-3xl" />
        <div className="absolute top-1/3 -left-16 w-56 h-56 rounded-full bg-amber-200/[0.07] blur-3xl" />
        <div className="absolute bottom-20 right-10 w-40 h-40 rounded-full bg-emerald-200/[0.06] blur-2xl" />
        <div className="absolute bottom-0 left-1/3 w-64 h-32 rounded-full bg-rose-200/[0.04] blur-2xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center px-4 py-3 shrink-0 md:px-8 lg:px-12" style={{ paddingTop: 'max(0.75rem, var(--safe-top))', paddingLeft: 'max(1rem, var(--safe-left))', paddingRight: 'max(1rem, var(--safe-right))' }}>
        <button
          onClick={() => {
            session.conversationRef.current = false
            if (voice.sttRetryTimerRef.current) {
              clearTimeout(voice.sttRetryTimerRef.current)
              voice.sttRetryTimerRef.current = null
            }
            voice.tts.stop()
            voice.stt.cancel()
            voice.rtc.disconnect()
            navigate('/')
          }}
          className="text-[var(--color-text-muted)] hover:text-teal-600 mr-3 text-xl transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-[var(--color-text-primary)]">思考教练</h1>
        <div className="ml-auto flex gap-3">
          <button
            onClick={() => {
              voice.tts.stop()
              voice.stt.cancel()
              voice.rtc.disconnect()
              navigate('/tree', {
                state: {
                  messages: chat.messages,
                  returnTo: { resumeSessionId: sessionId, gradeLevel },
                },
              })
            }}
            className="text-sm text-[var(--color-text-muted)] hover:text-teal-500 transition-colors"
          >
            思考链
          </button>
          <button
            onClick={() => {
              voice.tts.stop()
              voice.stt.cancel()
              voice.rtc.disconnect()
              navigate('/history', {
                state: {
                  returnTo: { resumeSessionId: sessionId, gradeLevel },
                },
              })
            }}
            className="text-sm text-[var(--color-text-muted)] hover:text-teal-500 transition-colors"
          >
            历史
          </button>
        </div>
      </header>

      {/* Main content area */}
      <div className="relative z-10 flex-1 flex flex-col md:flex-row items-center justify-center min-h-0 gap-4 md:gap-8 lg:gap-12 px-6 md:px-8 lg:px-16 max-w-6xl mx-auto w-full">
        {/* Orb area */}
        <div className="relative flex-1 flex items-center justify-center min-h-0 md:min-w-0">
          {/* Mascot guidance: Scene 2 (OCR wait) + Scene 3 (stuck) */}
          {state.phase === 'processing' && !chat.messages.length && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20">
              <BudMascot
                animate="idle"
                className="w-12 h-14"
                speechBubble="让我看看这道题..."
              />
            </div>
          )}
          {isStuck && state.phase === 'idle' && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20">
              <BudMascot
                animate="wave"
                className="w-12 h-14"
                speechBubble="没关系，换个角度想想"
              />
            </div>
          )}
          <AiCoachOrb
            phase={state.phase}
            emotion={lastEmotion}
          />
        </div>

        {/* Camera preview */}
        <div className="shrink-0 w-full md:flex-1 md:max-w-md lg:max-w-lg pb-3 md:pb-0">
          <CameraPreview
            videoRef={camera.videoRef}
            isOpen={camera.isOpen}
            error={camera.error}
            capturedImage={state.imageUrl}
            hasOcr={session.hasOcrRef.current}
            onCapture={() => { dismissGuide(); session.handleCapture() }}
            isOcrLoading={session.isOcrLoading}
          />
        </div>
      </div>

      {/* Completion card or control bar */}
      <div className="relative z-10">
        {/* First-time guidance: Bud mascot speech bubble */}
        {showGuide && state.phase === 'idle' && !chat.messages.length && !isStuck && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 z-30 animate-bounce">
            <BudMascot
              animate="wave"
              emotion="encouraging"
              className="w-16 h-20"
              speechBubble="拍张作业照片，我来陪你一起思考！📸"
            />
          </div>
        )}
        {state.sessionPhase === 'completed' ? (
          <CompletionCard
            messages={chat.messages}
            sessionStartTime={session.sessionStartTime}
          />
        ) : (
          <ControlBar
            phase={state.phase}
            hasOcr={session.hasOcrRef.current}
            showGotIt={session.showGotIt}
            sttTranscript={voice.stt.transcript}
            sttError={voice.stt.sttError}
            ttsError={voice.tts.ttsError}
            hasMessages={chat.messages.length > 0}
            rtcSubtitle={state.rtcSubtitle}
            onTalkPress={voice.handleTalkPress}
            onSwitchProblem={session.handleSwitchProblem}
            onGotIt={() => {
              voice.stt.cancel()
              voice.tts.stop()
              session.handleGotIt()
            }}
            onMoodSelect={session.handleMoodSelect}
            onRetrySTT={() => {
              session.conversationRef.current = true
              voice.startAutoListen()
            }}
          />
        )}
      </div>
    </div>
  )
}
