import { useState, useRef, useCallback, useEffect } from 'react'
import type { GradeLevel, Subject, InteractionPhase } from '../types'
import { fetchWithTimeout } from '../lib/api'

export interface RTCConnectParams {
  gradeLevel: GradeLevel
  /** OCR text to inject into Voice Agent system prompt context */
  ocrText?: string
  /** 检测到的学科（用于服务端 system prompt 构建） */
  subject?: Subject
  /** 学生知识上下文（来自 Phase 11 知识追踪层，buildKnowledgeContext 返回值） */
  knowledgeContext?: string
}

// 动态导入 RTC SDK（懒加载，~13MB）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedVERTC: any = null

async function loadRTCSDK() {
  if (cachedVERTC) return cachedVERTC
  const mod = await import('@volcengine/rtc')
  cachedVERTC = mod.default
  return cachedVERTC
}

/**
 * 预加载 RTC SDK（VOICE-02: D-12, D-13）
 * ChatPage mount 时调用，后台下载 SDK 不阻塞渲染
 * 加载结果缓存在 cachedVERTC，后续 connect() 直接使用
 */
export function prefetchRTCSDK(): void {
  // 已加载则跳过（D-13: 避免重复加载）
  if (cachedVERTC) return
  // 后台加载，不阻塞，失败静默（D-12 fallback: 失败时 connect() 重试）
  loadRTCSDK().catch(() => {})
}

/** 解析 RTC 二进制字幕消息 */
function parseSubtitle(data: Uint8Array): SubtitleData | null {
  if (data.length < 8) return null

  // 检查 magic number "subv" (0x73756276)
  const magic = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]
  if (magic !== 0x73756276) return null

  // payload 长度（大端序）
  const length = (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7]
  if (data.length - 8 < length) return null

  try {
    const json = new TextDecoder().decode(data.slice(8, 8 + length))
    return JSON.parse(json) as SubtitleData
  } catch {
    return null
  }
}

interface SubtitleItem {
  text: string
  userId: string
  definite: boolean
  paragraph: boolean
  sequence: number
  language?: string
}

interface SubtitleData {
  type: string
  data: SubtitleItem[]
}

/** RTC 健康检查超时（秒）：connect 成功后若这段时间内没收到任何字幕，视为不健康 */
const HEALTH_TIMEOUT_MS = 10_000

/** STAB-02: 单次 RTC 会话最长 30 分钟 (D-08) */
const SESSION_MAX_MS = 30 * 60 * 1000
/** 到期前 5 分钟发出温馨提示 */
const WARNING_BEFORE_MS = 5 * 60 * 1000

export interface RTCVoiceCallbacks {
  /** AI 说完一轮后回调 */
  onAIFinishSpeaking?: () => void
  /** 实时字幕更新 */
  onSubtitle?: (text: string, isUser: boolean, isFinal: boolean) => void
  /** 阶段变化 */
  onPhaseChange?: (phase: InteractionPhase) => void
  /** 错误回调 */
  onError?: (error: string) => void
  /** RTC 健康检查超时：connect 成功但长时间无字幕，外层应降级到旧 STT */
  onHealthTimeout?: () => void
  /** STAB-02: 会话即将到时提醒（25 分钟） */
  onTimeWarning?: (message: string) => void
  /** STAB-02: 会话到时自动断开（30 分钟） */
  onTimeLimit?: (message: string) => void
  /** 会话结束回调：cleanup 时如果有消息，通知外层运行分析管道 (DATA-01/02/03) */
  onSessionEnd?: (conversationId: string) => void
}

export function useRTCVoice(callbacks: RTCVoiceCallbacks) {
  const [isConnected, setIsConnected] = useState(false)
  const [phase, setPhaseState] = useState<InteractionPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [debugLogs, setDebugLogs] = useState<string[]>([])

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    const entry = `[${ts}] ${msg}`
    console.log('[RTC]', msg)
    setDebugLogs(prev => [...prev.slice(-19), entry]) // 最多保留 20 条
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineRef = useRef<any>(null)
  const roomIdRef = useRef<string>('')
  const userIdRef = useRef<string>('')
  const taskIdRef = useRef<string>('')
  const botUserIdRef = useRef<string>('')
  const healthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gotSubtitleRef = useRef(false)
  const sessionEndReportedRef = useRef(false)
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  // === RTC 消息缓冲 (STAB-04) ===
  interface BufferedMessage {
    role: 'user' | 'assistant'
    content: string
    timestamp: string
  }
  const messageBufferRef = useRef<BufferedMessage[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const conversationIdRef = useRef<string>('')

  // VOICE-04: 自动重连状态
  const MAX_RECONNECT_ATTEMPTS = 1  // 保持简单：仅重试 1 次
  const reconnectAttemptRef = useRef(0)
  const lastConnectParamsRef = useRef<RTCConnectParams | null>(null)
  const userInitiatedDisconnectRef = useRef(false)

  const setPhase = useCallback((p: InteractionPhase) => {
    setPhaseState(p)
    callbacksRef.current.onPhaseChange?.(p)
  }, [])

  /** 将缓冲消息批量发送到服务端 (STAB-04) */
  const flushMessageBuffer = useCallback(() => {
    const messages = messageBufferRef.current
    const convId = conversationIdRef.current
    if (messages.length === 0 || !convId) return

    // 清空缓冲（先取后清，避免竞态）
    messageBufferRef.current = []

    const payload = JSON.stringify({ conversationId: convId, messages })

    // 优先用 fetch，页面关闭时用 sendBeacon (D-02)
    if (document.visibilityState === 'hidden') {
      navigator.sendBeacon('/api/rtc-messages', new Blob([payload], { type: 'application/json' }))
    } else {
      fetch('/api/rtc-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(err => console.warn('[RTC] 消息上报失败:', err))
    }
  }, [])

  /** 连接 RTC 并启动语音对话 */
  const connect = useCallback(async (params: RTCConnectParams): Promise<boolean> => {
    try {
      setError(null)
      setDebugLogs([])

      // VOICE-04: 保存连接参数用于自动重连
      lastConnectParamsRef.current = params
      reconnectAttemptRef.current = 0
      userInitiatedDisconnectRef.current = false

      // 1. 加载 RTC SDK
      addLog('① 加载 RTC SDK...')
      const sdk = await loadRTCSDK()
      if (!sdk) throw new Error('RTC SDK 加载失败')
      addLog('① SDK 加载成功 ✓')

      const roomId = `room_${crypto.randomUUID().slice(0, 8)}`
      const userId = `user_${crypto.randomUUID().slice(0, 8)}`
      const taskId = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

      roomIdRef.current = roomId
      userIdRef.current = userId
      taskIdRef.current = taskId

      // 2. 获取 Token
      addLog('② 获取 Token...')
      const tokenRes = await fetchWithTimeout('/api/rtc-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, userId }),
        timeout: 10_000,
      })
      if (!tokenRes.ok) throw new Error('Token 获取失败')
      const { token, appId } = await tokenRes.json() as { token: string; appId: string }
      addLog(`② Token 获取成功 ✓ appId=${appId.slice(0, 8)}...`)

      // 3. 创建引擎并加入房间
      addLog('③ 创建引擎...')
      const engine = sdk.createEngine(appId)
      engineRef.current = engine

      // 监听所有关键 SDK 事件（用于诊断）
      engine.on(sdk.events.onUserJoined, (event: { userInfo: { userId: string } }) => {
        addLog(`事件: 用户入房 ${event.userInfo.userId}`)
      })
      engine.on(sdk.events.onUserLeave, (event: { userInfo: { userId: string } }) => {
        addLog(`事件: 用户离房 ${event.userInfo.userId}`)
      })
      engine.on(sdk.events.onRoomStateChanged, (event: { state: number; extraInfo: string }) => {
        addLog(`事件: 房间状态变化 state=${event.state} info=${event.extraInfo}`)

        // VOICE-04: 检测意外断开并尝试自动重连
        // state=0 表示断开连接
        if (event.state === 0 && !userInitiatedDisconnectRef.current && lastConnectParamsRef.current) {
          if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptRef.current++
            addLog('[RTC] 检测到意外断开，1秒后尝试自动重连...')
            setTimeout(() => {
              if (lastConnectParamsRef.current) {
                connect(lastConnectParamsRef.current).catch((err) => {
                  console.error('[RTC] 自动重连失败:', err)
                  callbacksRef.current.onError?.('语音连接断开，请重新点击麦克风')
                })
              }
            }, 1000)
            return  // 不触发 onError，等待重连结果
          }
        }
      })
      engine.on(sdk.events.onAudioStreamSubscribed, (event: { userId: string }) => {
        addLog(`事件: 订阅音频流 user=${event.userId}`)
      })

      // 监听字幕（Voice Agent 通过二进制房间消息下发 "subv" 格式字幕）
      let binaryMsgCount = 0
      engine.on(sdk.events.onRoomBinaryMessageReceived, (event: { uid: string; message: ArrayBuffer }) => {
        binaryMsgCount++
        const data = new Uint8Array(event.message)
        const subtitle = parseSubtitle(data)

        if (!subtitle) {
          addLog(`收到二进制消息 #${binaryMsgCount} (${data.length}B) 非字幕格式 magic=0x${data.slice(0, 4).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')}`)
          return
        }
        if (subtitle.type !== 'subtitle') {
          addLog(`收到二进制消息 #${binaryMsgCount} type=${subtitle.type}（非subtitle）`)
          return
        }

        // 首条字幕到达 → 健康检查通过
        if (!gotSubtitleRef.current) {
          gotSubtitleRef.current = true
          if (healthTimerRef.current) {
            clearTimeout(healthTimerRef.current)
            healthTimerRef.current = null
          }
          addLog('✅ 健康检查通过：收到首条字幕')
        }

        for (const item of subtitle.data) {
          const isUser = item.userId === userIdRef.current
          const tag = isUser ? '用户' : 'AI'
          addLog(`字幕[${tag}] ${item.definite ? '✓' : '...'} "${item.text.slice(0, 30)}"`)
          callbacksRef.current.onSubtitle?.(item.text, isUser, item.definite)

          // 缓冲最终字幕用于持久化 (STAB-04)
          if (item.definite && item.text.trim()) {
            messageBufferRef.current.push({
              role: isUser ? 'user' : 'assistant',
              content: item.text.trim(),
              timestamp: new Date().toISOString(),
            })
          }

          if (!isUser && item.paragraph) {
            setPhase('listening')
            callbacksRef.current.onAIFinishSpeaking?.()
          }
          if (!isUser && !item.paragraph && item.sequence === 1) {
            setPhase('speaking')
          }
          if (isUser && !item.paragraph && item.sequence === 1) {
            setPhase('processing')
          }
        }
      })

      // 也监听官方字幕事件（排查是否字幕走的这个通道）
      if (sdk.events.onSubtitleMessageReceived) {
        engine.on(sdk.events.onSubtitleMessageReceived, (msgs: unknown) => {
          addLog(`事件: onSubtitleMessageReceived 触发! ${JSON.stringify(msgs).slice(0, 100)}`)
        })
      }

      // 监听错误
      engine.on(sdk.events.onError, (err: { errorCode: number; message: string }) => {
        addLog(`❌ 引擎错误: code=${err.errorCode} ${err.message}`)
        callbacksRef.current.onError?.(err.message)
      })

      addLog('③ 加入房间...')
      await engine.joinRoom(token, roomId, { userId }, {
        isAutoPublish: true,
        isAutoSubscribeAudio: true,
      })
      addLog(`③ 加入房间成功 ✓ room=${roomId}`)

      // 4. 启动麦克风（先检查权限，避免浪费服务端资源）
      addLog('④ 启动麦克风...')
      try {
        await engine.startAudioCapture()
      } catch (micErr) {
        const micMsg = micErr instanceof Error ? micErr.message : '麦克风启动失败'
        addLog(`④ ❌ 麦克风失败: ${micMsg}`)
        // 清理已加入的房间
        engine.leaveRoom()
        throw new Error(`麦克风权限被拒绝或不可用: ${micMsg}`)
      }
      addLog('④ 麦克风启动成功 ✓')

      // 5. 启动服务端语音对话任务
      addLog('⑤ 启动 Voice Agent...')
      // 合并 OCR 上下文与知识上下文（两者都是可选的非关键信息）
      const ocrPart = params.ocrText
        ? `[学生拍了一道题，OCR识别结果如下]\n${params.ocrText}\n\n请根据这道题开始引导学生。`
        : ''
      const knowledgePart = params.knowledgeContext ?? ''
      const combinedContext = [ocrPart, knowledgePart].filter(Boolean).join('\n\n')
      const learnerContext = combinedContext || undefined

      const startRes = await fetchWithTimeout('/api/rtc-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          userId,
          taskId,
          gradeLevel: params.gradeLevel,
          learnerContext,
          ...(params.subject ? { subject: params.subject } : {}),
        }),
        timeout: 15_000,
      })
      if (!startRes.ok) {
        const errData = await startRes.json().catch(() => ({})) as { error?: string }
        throw new Error(errData.error || '启动语音对话失败')
      }
      const { botUserId } = await startRes.json() as { botUserId: string }
      botUserIdRef.current = botUserId
      addLog(`⑤ Voice Agent 启动成功 ✓ bot=${botUserId}`)

      setIsConnected(true)
      setPhase('listening')
      gotSubtitleRef.current = false
      sessionEndReportedRef.current = false

      // 启动 30 秒定时 flush (STAB-04)
      conversationIdRef.current = `rtc_${roomId}`
      flushTimerRef.current = setInterval(flushMessageBuffer, 30_000)

      addLog('⑥ 等待字幕... 请说话')

      // 健康检查超时
      healthTimerRef.current = setTimeout(() => {
        if (!gotSubtitleRef.current) {
          addLog(`❌ ${HEALTH_TIMEOUT_MS / 1000}秒内未收到字幕，触发降级`)
          callbacksRef.current.onHealthTimeout?.()
        }
      }, HEALTH_TIMEOUT_MS)

      // STAB-02: 30 分钟会话限制（D-08）
      warningTimerRef.current = setTimeout(() => {
        addLog('⏰ 25 分钟提醒')
        callbacksRef.current.onTimeWarning?.(
          '我们已经聊了好一会了，把今天学到的先记在纸上吧'
        )
      }, SESSION_MAX_MS - WARNING_BEFORE_MS)

      sessionTimerRef.current = setTimeout(() => {
        addLog('⏰ 30 分钟到时，自动断开')
        callbacksRef.current.onTimeLimit?.(
          '这道题我们聊得很深入了，先把想法整理一下，想好了再来找我'
        )
        cleanup()
      }, SESSION_MAX_MS)

      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'RTC 连接失败'
      addLog(`❌ 连接失败: ${msg}`)
      setError(msg)
      callbacksRef.current.onError?.(msg)
      cleanup()
      return false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup/flushMessageBuffer are stable refs, adding them causes render loops
  }, [setPhase, addLog])

  /** 断开 RTC 连接 */
  const disconnect = useCallback(() => {
    userInitiatedDisconnectRef.current = true  // VOICE-04: 标记用户主动断开，不触发自动重连
    cleanup()
    setPhase('idle')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup is defined after this callback, stable via ref pattern
  }, [setPhase])

  /** 停止服务端任务并清理引擎 */
  const cleanup = useCallback(() => {
    // DATA-01/02/03: 通知外层运行分析管道（在 flush 之前触发，此时 messageBuffer 还有数据可参考）
    // 但实际分析使用 chat.messages（由外层持有），不依赖 messageBufferRef
    const convId = conversationIdRef.current
    if (convId && !sessionEndReportedRef.current && gotSubtitleRef.current) {
      sessionEndReportedRef.current = true
      callbacksRef.current.onSessionEnd?.(convId)
    }

    // Flush 剩余缓冲消息 (STAB-04)
    flushMessageBuffer()
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current)
      flushTimerRef.current = null
    }

    if (healthTimerRef.current) {
      clearTimeout(healthTimerRef.current)
      healthTimerRef.current = null
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current)
      warningTimerRef.current = null
    }
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current)
      sessionTimerRef.current = null
    }

    // 通知服务端停止 Voice Agent 任务（防止幽灵任务消耗 LLM token）
    const roomId = roomIdRef.current
    const taskId = taskIdRef.current
    if (roomId && taskId) {
      fetchWithTimeout('/api/rtc-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, taskId }),
        timeout: 5_000,
      }).catch(() => {}) // fire-and-forget
      roomIdRef.current = ''
      taskIdRef.current = ''
    }

    // VOICE-04: 清理时重置用户主动断开标记
    userInitiatedDisconnectRef.current = false
    const engine = engineRef.current
    if (engine) {
      try {
        engine.stopAudioCapture()
        engine.leaveRoom()
        if (typeof engine.destroyEngine === 'function') {
          engine.destroyEngine()
        } else if (typeof engine.destroy === 'function') {
          engine.destroy()
        }
      } catch (e) {
        console.warn('[RTC] cleanup error:', e)
      }
      engineRef.current = null
    }
    setIsConnected(false)
  }, [flushMessageBuffer])

  // VOI-04: visibilitychange 重连机制审查
  // 设计: 页面恢复时若 RTC 引擎已丢失，通过 onError 委托给 ChatPage 处理
  // ChatPage 收到错误后决定是否重连或回退文字模式
  // 不在 useRTCVoice 内部直接调用 connect()，因为会话生命周期由外层管理
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && !engineRef.current && isConnected) {
        // 页面恢复但引擎已丢失 → 需要重新连接
        // 由外层 ChatPage 处理重连逻辑
        callbacksRef.current.onError?.('页面恢复，需要重新连接')
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [isConnected])

  // visibilitychange flush — 页面隐藏时用 sendBeacon 发送缓冲消息 (STAB-04)
  useEffect(() => {
    const handleVisibilityForFlush = () => {
      if (document.visibilityState === 'hidden') {
        flushMessageBuffer()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityForFlush)
    return () => document.removeEventListener('visibilitychange', handleVisibilityForFlush)
  }, [flushMessageBuffer])

  // 组件卸载时清理
  useEffect(() => {
    return () => { cleanup() }
  }, [cleanup])

  return {
    isConnected,
    phase,
    error,
    debugLogs,
    connect,
    disconnect,
    setConversationId: (id: string) => { conversationIdRef.current = id },
  }
}
