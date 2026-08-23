/**
 * 浏览器端录音工具
 * 优先使用 AudioWorklet（主线程零负载），不支持时回退 ScriptProcessorNode
 * 采集 16kHz 单声道 PCM，编码为 WAV base64，用于服务端语音识别
 */

const supportsWorklet = typeof AudioWorkletNode !== 'undefined'

export class AudioRecorder {
  private audioCtx: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private workletNode: AudioWorkletNode | null = null
  private legacyProcessor: ScriptProcessorNode | null = null
  private chunks: Float32Array[] = []
  private hasSpeech = false
  private recording = false
  private onSilenceCallback: (() => void) | null = null
  private onVolumeCallback: ((level: number) => void) | null = null

  // ScriptProcessorNode 回退专用
  private silenceStart = 0

  async start(
    onSilence: () => void,
    onVolume?: (level: number) => void,
    silenceMs = 2500
  ) {
    this.onSilenceCallback = onSilence
    this.onVolumeCallback = onVolume || null
    this.chunks = []
    this.silenceStart = 0
    this.hasSpeech = false
    this.recording = true

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })

    this.audioCtx = new AudioContext({ sampleRate: 16000 })
    this.source = this.audioCtx.createMediaStreamSource(this.stream)

    if (supportsWorklet) {
      await this.startWithWorklet(silenceMs)
    } else {
      this.startWithScriptProcessor(silenceMs)
    }
  }

  private async startWithWorklet(silenceMs: number) {
    await this.audioCtx!.audioWorklet.addModule('/audio-worklet-processor.js')
    this.workletNode = new AudioWorkletNode(this.audioCtx!, 'recorder-processor')

    // 配置静默阈值
    this.workletNode.port.postMessage({ type: 'config', silenceMs })

    this.workletNode.port.onmessage = (e) => {
      if (!this.recording) return
      const { type, level, data } = e.data
      if (type === 'volume') {
        this.onVolumeCallback?.(level)
        if (level > 0.15) this.hasSpeech = true
      } else if (type === 'pcm') {
        this.chunks.push(data as Float32Array)
      } else if (type === 'silence') {
        this.onSilenceCallback?.()
      }
    }

    this.source!.connect(this.workletNode)
    this.workletNode.connect(this.audioCtx!.destination)
  }

  private startWithScriptProcessor(silenceMs: number) {
    this.legacyProcessor = this.audioCtx!.createScriptProcessor(4096, 1, 1)

    const SPEECH_THRESHOLD = 0.015
    const SILENCE_THRESHOLD = 0.008

    this.legacyProcessor.onaudioprocess = (e) => {
      if (!this.recording) return

      const data = e.inputBuffer.getChannelData(0)
      this.chunks.push(new Float32Array(data))

      let sum = 0
      for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i]
      }
      const rms = Math.sqrt(sum / data.length)

      this.onVolumeCallback?.(Math.min(rms * 10, 1))

      if (rms > SPEECH_THRESHOLD) {
        this.hasSpeech = true
        this.silenceStart = 0
      } else if (rms < SILENCE_THRESHOLD && this.hasSpeech) {
        if (!this.silenceStart) {
          this.silenceStart = Date.now()
        } else if (Date.now() - this.silenceStart > silenceMs) {
          this.onSilenceCallback?.()
        }
      }
    }

    this.source!.connect(this.legacyProcessor)
    this.legacyProcessor.connect(this.audioCtx!.destination)
  }

  stop(): string | null {
    this.recording = false

    // 通知 worklet 停止（它会收集好的 chunks 通过 port 发回）
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'stop' })
      this.workletNode.disconnect()
      this.workletNode = null
    }

    this.legacyProcessor?.disconnect()
    this.legacyProcessor = null
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())

    if (this.audioCtx?.state !== 'closed') {
      this.audioCtx?.close()
    }

    this.audioCtx = null
    this.stream = null
    this.source = null

    if (!this.hasSpeech || this.chunks.length < 5) {
      return null
    }

    const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0)
    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of this.chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    this.chunks = []

    return encodeWAV(merged, 16000)
  }

  get isRecording() {
    return this.recording
  }
}

/** 将 Float32Array PCM 数据编码为 WAV 格式的 base64 字符串 */
function encodeWAV(samples: Float32Array, sampleRate: number): string {
  const numSamples = samples.length
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, numSamples * 2, true)

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }

  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
