// 豆包语音合成 (TTS) Provider
// 官方文档: https://www.volcengine.com/docs/6561/79820
// HTTP 一次性合成接口，返回 base64 编码音频

import { getEnvVar } from '../../env'
import { generateUUID } from '../../utils/uuid'

const TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v1/tts'

interface TTSRequest {
  text: string
  /** 前端语速 0.5-2.0，服务端映射到豆包 speed_ratio */
  rate?: number
}

/**
 * 将前端 rate (0.5-2.0, 默认 1.15) 映射到豆包 speed_ratio (0.2-3.0, 默认 1.0)
 * 线性映射：前端 0.5 → 豆包 0.5, 前端 1.0 → 豆包 1.0, 前端 2.0 → 豆包 2.0
 * 保持 1:1 映射即可，范围已兼容
 */
function mapSpeedRatio(rate?: number): number {
  if (typeof rate !== 'number' || rate < 0.5 || rate > 2.0) return 1.0
  // 直接使用，豆包范围 0.2-3.0 完全覆盖前端 0.5-2.0
  return Math.round(rate * 10) / 10 // 保留一位小数
}

/**
 * 调用豆包语音合成，返回音频二进制数据 (mp3)
 */
export async function synthesizeSpeech(
  env: Record<string, string | undefined>,
  request: TTSRequest
): Promise<ArrayBuffer> {
  const appId = getEnvVar(env, 'TTS_APP_ID')
  const accessToken = getEnvVar(env, 'TTS_ACCESS_TOKEN')
  const cluster = getEnvVar(env, 'TTS_CLUSTER')
  const voiceType = getEnvVar(env, 'TTS_VOICE_TYPE')

  const speedRatio = mapSpeedRatio(request.rate)

  const payload = {
    app: {
      appid: appId,
      token: accessToken,
      cluster,
    },
    user: {
      uid: 'thinkbud-user',
    },
    audio: {
      voice_type: voiceType,
      encoding: 'mp3',
      speed_ratio: speedRatio,
      volume_ratio: 1.0,
      pitch_ratio: 1.0,
    },
    request: {
      reqid: generateUUID(),
      text: request.text,
      operation: 'query',
    },
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  const res = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer;${accessToken}`,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
  clearTimeout(timeout)

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`豆包 TTS 请求失败 (${res.status}): ${errText}`)
  }

  const result = await res.json() as {
    code: number
    message: string
    data?: string // base64 encoded audio
  }

  if (result.code !== 3000 || !result.data) {
    throw new Error(`豆包 TTS 错误 (${result.code}): ${result.message}`)
  }

  // base64 → ArrayBuffer
  const binaryString = atob(result.data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}
