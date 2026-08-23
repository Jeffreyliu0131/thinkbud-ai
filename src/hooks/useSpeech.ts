import { useState, useRef, useCallback, useEffect } from 'react'
import { AudioRecorder } from '../lib/audioRecorder'
import { fetchWithTimeout } from '../lib/api'

// ===== 全局 AudioContext（用户手势时 unlock，后续无需手势即可播放）=====
let sharedAudioCtx: AudioContext | null = null

/** 在用户手势事件中调用，播放无声缓冲区保持 AudioContext 活跃（iOS Safari 要求） */
export function unlockAudioContext() {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioContext()
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume()
  }
  // 播放无声缓冲区 — iOS Safari 需要在用户手势中实际播放过音频，
  // 之后即使手势上下文过期，AudioContext 也不会被重新 suspend
  const buf = sharedAudioCtx.createBuffer(1, 1, sharedAudioCtx.sampleRate)
  const src = sharedAudioCtx.createBufferSource()
  src.buffer = buf
  src.connect(sharedAudioCtx.destination)
  src.start(0)
}

function getAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioContext()
  }
  return sharedAudioCtx
}

// ===== CSS 变量驱动 audioLevel（避免 60fps React 重渲染）=====
function setAudioLevelCSS(value: number) {
  document.documentElement.style.setProperty('--audio-level', value.toFixed(3))
}

// ===== TTS: Edge TTS 优先，浏览器内置语音合成兜底 =====
export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [ttsError, setTtsError] = useState('')
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const stopFlagRef = useRef(false)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number>(0)

  // 浏览器内置语音合成（兜底方案，零配置）
  const speakWithBrowser = useCallback((text: string, rate?: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('浏览器不支持语音合成'))
        return
      }

      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'
      utterance.rate = rate ?? 1.1

      const voices = window.speechSynthesis.getVoices()
      const zhVoice = voices.find(
        (v) => v.lang.startsWith('zh') && v.localService
      )
      if (zhVoice) utterance.voice = zhVoice

      utterance.onend = () => resolve()
      utterance.onerror = (e) => reject(e)
      window.speechSynthesis.speak(utterance)
    })
  }, [])

  // Edge TTS 服务端（使用 AudioContext 播放，无需用户手势）
  const speakWithServer = useCallback(async (text: string, rate?: number) => {
    console.log('[TTS] 请求 Edge TTS…', rate ? `rate=${rate}` : '')
    const res = await fetchWithTimeout('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, rate }),
      timeout: 15_000,
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[TTS] 服务器返回错误:', res.status, errText)
      throw new Error(errText)
    }

    const arrayBuffer = await res.arrayBuffer()
    console.log('[TTS] 收到音频数据:', arrayBuffer.byteLength, 'bytes')

    if (arrayBuffer.byteLength < 100) {
      throw new Error('音频数据太小，可能无效')
    }

    let ctx = getAudioContext()

    // iOS Safari: resume 可能静默失败，重建 AudioContext 重试
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {})
    }
    if (ctx.state === 'suspended') {
      console.warn('[TTS] AudioContext suspended，重建')
      sharedAudioCtx = new AudioContext()
      ctx = sharedAudioCtx
      await ctx.resume().catch(() => {})
      if (ctx.state === 'suspended') {
        throw new Error('AudioContext 无法恢复')
      }
    }

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    console.log('[TTS] 音频解码成功，时长:', audioBuffer.duration.toFixed(1), 's')

    if (stopFlagRef.current) {
      stopFlagRef.current = false
      throw new Error('播放已被取消')
    }

    return new Promise<void>((resolve, reject) => {
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(safetyTimer)
        cancelAnimationFrame(rafRef.current)
        analyserRef.current = null
        sourceNodeRef.current = null
        setAudioLevelCSS(0)
        console.log('[TTS] Edge TTS 播放完毕')
        resolve()
      }

      // 接入 AnalyserNode 驱动 audioLevel
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      source.connect(analyser)
      analyser.connect(ctx.destination)
      sourceNodeRef.current = source

      // 用 requestAnimationFrame 读取频率数据 → 写入 CSS 变量
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        const avg = sum / dataArray.length / 255
        setAudioLevelCSS(avg)
        rafRef.current = requestAnimationFrame(tick)
      }

      source.onended = finish

      // Safari/WebKit 有时不触发 onended，用音频时长兜底
      const safetyTimer = setTimeout(finish, (audioBuffer.duration + 1.5) * 1000)

      try {
        source.start(0)
        rafRef.current = requestAnimationFrame(tick)
        console.log('[TTS] Edge TTS 音频开始播放, 时长:', audioBuffer.duration.toFixed(1), 's')
      } catch (e) {
        settled = true
        clearTimeout(safetyTimer)
        cancelAnimationFrame(rafRef.current)
        analyserRef.current = null
        sourceNodeRef.current = null
        setAudioLevelCSS(0)
        reject(e)
      }
    })
  }, [])

  const speak = useCallback(async (text: string, options?: { rate?: number }) => {
    if (!text.trim()) return

    const rate = options?.rate

    stopFlagRef.current = false
    setTtsError('')
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop() } catch { /* ignore */ }
      sourceNodeRef.current = null
    }
    window.speechSynthesis?.cancel()

    setIsSpeaking(true)

    try {
      await speakWithServer(text, rate)
    } catch (serverErr) {
      console.warn('[TTS] Edge TTS 不可用，回退浏览器语音:', serverErr)
      try {
        await speakWithBrowser(text, rate)
      } catch (browserErr) {
        console.error('[TTS] 浏览器语音也失败:', browserErr)
        setTtsError('语音播放失败，请检查音量设置')
        setTimeout(() => setTtsError(''), 5000)
      }
    } finally {
      setIsSpeaking(false)
    }
  }, [speakWithServer, speakWithBrowser])

  const stop = useCallback(() => {
    stopFlagRef.current = true
    cancelAnimationFrame(rafRef.current)
    analyserRef.current = null
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop() } catch { /* ignore */ }
      sourceNodeRef.current = null
    }
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
    setAudioLevelCSS(0)
  }, [])

  // 组件卸载时停止一切播放
  useEffect(() => {
    return () => {
      stopFlagRef.current = true
      cancelAnimationFrame(rafRef.current)
      analyserRef.current = null
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop() } catch { /* ignore */ }
        sourceNodeRef.current = null
      }
      window.speechSynthesis?.cancel()
      setAudioLevelCSS(0)
    }
  }, [])

  return { isSpeaking, ttsError, speak, stop }
}

// ===== STT: 服务端语音识别（AudioRecorder + /api/stt）=====

export interface STTOptions {
  /** 静默多久后自动停止（毫秒），默认 2500 */
  silenceTimeout?: number
  /** 识别结束但没有任何语音输入时的回调 */
  onEmpty?: () => void
  /** 静默检测触发时立即回调（在STT请求之前），用于提前切换UI状态 */
  onSilenceDetected?: () => void
}

export function useSTT() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [sttError, setSttError] = useState('')
  const recorderRef = useRef<AudioRecorder | null>(null)
  const callbacksRef = useRef<{
    onResult: ((text: string) => void) | null
    onEmpty: (() => void) | null
    onSilenceDetected: (() => void) | null
  }>({ onResult: null, onEmpty: null, onSilenceDetected: null })
  const activeRef = useRef(false)

  /** 内部：将录音发送到服务端 STT 并处理结果 */
  const processAudio = useCallback(async (audioBase64: string | null) => {
    if (!activeRef.current) return

    if (!audioBase64) {
      // 没有检测到语音
      activeRef.current = false
      setIsListening(false)
      setTranscript('')
      callbacksRef.current.onEmpty?.()
      return
    }

    setTranscript('')

    try {
      const res = await fetchWithTimeout('/api/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: audioBase64 }),
        timeout: 15_000,
      })

      if (!activeRef.current) return

      const data = await res.json()

      if (!res.ok) {
        const errDetail = data.error || `HTTP ${res.status}`
        console.error('[STT] 服务器返回错误:', errDetail)
        throw new Error(errDetail)
      }

      const text: string = (data.text || '').trim()

      if (!activeRef.current) return

      activeRef.current = false
      setIsListening(false)

      if (text) {
        console.log('[STT] 识别结果:', text)
        setTranscript(text)
        callbacksRef.current.onResult?.(text)
      } else {
        setTranscript('')
        callbacksRef.current.onEmpty?.()
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '语音识别失败'
      console.error('[STT] 语音识别错误:', errMsg)
      if (!activeRef.current) return
      activeRef.current = false
      setIsListening(false)
      setTranscript('')
      // 用独立的 sttError 状态，ControlBar 可显示重试按钮
      setSttError(`识别失败: ${errMsg}`)
      setTimeout(() => {
        setSttError('')
        callbacksRef.current.onEmpty?.()
      }, 3000)
    }
  }, [])

  const startListening = useCallback(
    (onResult: (text: string) => void, options?: STTOptions) => {
      // 清理上一次
      if (recorderRef.current?.isRecording) {
        recorderRef.current.stop()
      }

      callbacksRef.current = { onResult, onEmpty: options?.onEmpty || null, onSilenceDetected: options?.onSilenceDetected || null }
      activeRef.current = true
      setTranscript('')
      setSttError('')
      setIsListening(true)

      const recorder = new AudioRecorder()
      recorderRef.current = recorder

      recorder
        .start(
          () => {
            // 静默检测触发 → 立即通知UI + 停止录音并处理
            callbacksRef.current.onSilenceDetected?.()
            const audio = recorder.stop()
            recorderRef.current = null
            setAudioLevelCSS(0)
            processAudio(audio)
          },
          (level) => setAudioLevelCSS(level),
          options?.silenceTimeout ?? 2500
        )
        .catch((err) => {
          console.error('[STT] 录音启动失败:', err)
          activeRef.current = false
          setIsListening(false)
          callbacksRef.current.onEmpty?.()
        })
    },
    [processAudio]
  )

  /** 手动停止录音并处理（如果有音频） */
  const stopListening = useCallback(() => {
    setAudioLevelCSS(0)
    if (recorderRef.current?.isRecording) {
      const audio = recorderRef.current.stop()
      recorderRef.current = null
      processAudio(audio)
    } else {
      // 没有在录音（可能在等服务器响应），取消
      activeRef.current = false
      setIsListening(false)
      setTranscript('')
    }
  }, [processAudio])

  /** 取消录音，不处理音频 */
  const cancel = useCallback(() => {
    activeRef.current = false
    setAudioLevelCSS(0)
    if (recorderRef.current?.isRecording) {
      recorderRef.current.stop()
      recorderRef.current = null
    }
    setIsListening(false)
    setTranscript('')
  }, [])

  return { isListening, transcript, sttError, startListening, stopListening, cancel }
}
