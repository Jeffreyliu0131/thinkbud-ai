// 豆包语音识别 (STT) Provider — 大模型录音文件极速版
// 官方文档: https://www.volcengine.com/docs/6561/1631584
// 接收 base64 WAV，返回识别文本

import { getEnvVar } from '../../env'
import { generateUUID } from '../../utils/uuid'

const STT_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash'

interface STTRequest {
  /** base64 编码的 WAV 音频 */
  audioBase64: string
}

interface STTResponse {
  text: string
}

/**
 * 调用豆包录音文件极速版识别
 */
export async function recognizeSpeech(
  env: Record<string, string | undefined>,
  request: STTRequest
): Promise<STTResponse> {
  const appId = getEnvVar(env, 'STT_APP_ID')
  const accessToken = getEnvVar(env, 'STT_ACCESS_TOKEN')

  const payload = {
    user: {
      uid: 'thinkbud-user',
    },
    audio: {
      data: request.audioBase64,
      format: 'wav',
    },
    request: {
      model_name: 'bigmodel',
    },
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  const res = await fetch(STT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-App-Key': appId,
      'X-Api-Access-Key': accessToken,
      'X-Api-Resource-Id': 'volc.bigasr.auc_turbo',
      'X-Api-Request-Id': generateUUID(),
      'X-Api-Sequence': '-1',
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
  clearTimeout(timeout)

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`豆包语音识别请求失败 (${res.status}): ${errText}`)
  }

  // 检查响应头状态码
  const statusCode = res.headers.get('X-Api-Status-Code')
  if (statusCode && statusCode !== '20000000') {
    const errText = await res.text()
    throw new Error(`豆包语音识别错误 (${statusCode}): ${errText}`)
  }

  const result = await res.json() as {
    result?: {
      text?: string
      utterances?: Array<{ text: string }>
    }
  }

  const text = result.result?.text || ''
  return { text }
}
