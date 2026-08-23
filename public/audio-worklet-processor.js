/**
 * AudioWorklet 处理器：录音 + RMS 音量计算 + 静默检测
 * 在独立线程运行，不阻塞主线程
 */
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._chunks = []
    this._hasSpeech = false
    this._silenceStart = 0
    this._silenceMs = 2500
    this._recording = true

    this.port.onmessage = (e) => {
      if (e.data.type === 'config') {
        this._silenceMs = e.data.silenceMs || 2500
      } else if (e.data.type === 'stop') {
        this._recording = false
      }
    }
  }

  process(inputs) {
    if (!this._recording) return false

    const input = inputs[0]
    if (!input || !input[0]) return true

    const data = input[0]
    // 复制数据（process 回调中的 buffer 会被复用）
    this._chunks.push(new Float32Array(data))

    // 计算 RMS
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i]
    }
    const rms = Math.sqrt(sum / data.length)

    // 发送音量 + PCM 数据到主线程（主线程负责合并编码 WAV）
    const copied = new Float32Array(data)
    this.port.postMessage({ type: 'volume', level: Math.min(rms * 10, 1) })
    this.port.postMessage({ type: 'pcm', data: copied }, [copied.buffer])

    const SPEECH_THRESHOLD = 0.015
    const SILENCE_THRESHOLD = 0.008

    if (rms > SPEECH_THRESHOLD) {
      this._hasSpeech = true
      this._silenceStart = 0
    } else if (rms < SILENCE_THRESHOLD && this._hasSpeech) {
      if (!this._silenceStart) {
        this._silenceStart = currentTime * 1000
      } else if (currentTime * 1000 - this._silenceStart > this._silenceMs) {
        this.port.postMessage({ type: 'silence' })
        // 只触发一次
        this._silenceStart = 0
        this._hasSpeech = false
      }
    }

    return true
  }
}

registerProcessor('recorder-processor', RecorderProcessor)
