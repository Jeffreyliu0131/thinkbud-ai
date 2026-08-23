/**
 * 本地开发 API 服务器
 * 在本地模拟 Vercel Edge/Serverless Functions，方便开发调试
 * 启动命令：npx tsx dev-server.ts
 */
import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { randomUUID } from 'crypto'

config() // 加载 .env

const app = express()
app.use(cors({ origin: /^https?:\/\/localhost(:\d+)?$/ }))
app.use(express.json({ limit: '10mb' }))

// ===== /api/chat — 火山方舟 Chat 代理（OpenAI 兼容）=====
const CHAT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const CHAT_TIMEOUT = 25_000

app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.ARK_API_KEY
  const modelId = process.env.ARK_MODEL_ID
  if (!apiKey || !modelId) {
    return res.status(500).json({ error: 'ARK_API_KEY 或 ARK_MODEL_ID 未配置' })
  }

  try {
    const { messages, systemPrompt } = req.body

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '消息不能为空' })
    }
    if (messages.length > 50) {
      return res.status(400).json({ error: '消息过多' })
    }
    if (!systemPrompt || typeof systemPrompt !== 'string') {
      return res.status(400).json({ error: '缺少 systemPrompt' })
    }

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    // 超长上下文截断
    const MAX_CHARS = 16000
    const totalChars = fullMessages.reduce((sum: number, m: { content: string }) => sum + m.content.length, 0)
    if (totalChars > MAX_CHARS) {
      const system = fullMessages.slice(0, 1)
      const head = fullMessages.slice(1, 3)
      const tail = fullMessages.slice(-16)
      fullMessages.length = 0
      fullMessages.push(...system, ...head, { role: 'user', content: '[...前面的对话已省略...]' }, ...tail)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT)

    const apiRes = await fetch(`${CHAT_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: fullMessages,
        max_tokens: 1024,
        stream: true,
        temperature: 0.7,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!apiRes.ok) {
      const errorText = await apiRes.text()
      console.error('[Chat] 方舟 API 错误:', apiRes.status, errorText)
      return res.status(apiRes.status).json({ error: `方舟 API 错误: ${errorText}` })
    }

    // 服务端解析 SSE 流，拼接完整回复后返回 JSON
    const reader = apiRes.body?.getReader()
    if (!reader) {
      return res.status(500).json({ error: '无法读取响应流' })
    }

    const decoder = new TextDecoder()
    let fullContent = ''
    let lineBuffer = ''

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
          const event = JSON.parse(data)
          const delta = event.choices?.[0]?.delta?.content
          if (delta) fullContent += delta
        } catch { /* skip malformed chunks */ }
      }
    }

    if (lineBuffer.startsWith('data: ')) {
      const data = lineBuffer.slice(6).trim()
      if (data && data !== '[DONE]') {
        try {
          const event = JSON.parse(data)
          const delta = event.choices?.[0]?.delta?.content
          if (delta) fullContent += delta
        } catch { /* skip */ }
      }
    }

    console.log('[Chat] 方舟回复长度:', fullContent.length)
    res.json({ content: fullContent })
  } catch (err) {
    const message = err instanceof Error ? err.message : '对话处理失败'
    console.error('[Chat]', message)
    res.status(500).json({ error: message })
  }
})

// ===== /api/ocr — 火山引擎 OCR（正式方案） + 方舟视觉模型（兜底） =====

// 火山引擎 V4 签名（dev-server 内联实现，与 functions/_shared 逻辑一致）
async function hmacSHA256(key: ArrayBuffer | Buffer, message: string): Promise<Buffer> {
  const { createHmac } = await import('crypto')
  const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key)
  return createHmac('sha256', keyBuffer).update(message).digest()
}

async function sha256Hex(message: string): Promise<string> {
  const { createHash } = await import('crypto')
  return createHash('sha256').update(message).digest('hex')
}

async function volcSign(params: {
  method: string; path: string; query: Record<string, string>
  headers: Record<string, string>; body: string
  accessKeyId: string; secretAccessKey: string
  service: string; region: string; date: Date
}) {
  const { method, path, query, headers, body, accessKeyId, secretAccessKey, service, region, date } = params
  const timestamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dateStamp = date.toISOString().slice(0, 10).replace(/-/g, '')
  const credentialScope = `${dateStamp}/${region}/${service}/request`

  const sortedQKeys = Object.keys(query).sort()
  const canonicalQS = sortedQKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join('&')
  const signedHeaderKeys = Object.keys(headers).map(k => k.toLowerCase()).sort()
  const signedHeaders = signedHeaderKeys.join(';')
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[Object.keys(headers).find(h => h.toLowerCase() === k)!].trim()}`).join('\n') + '\n'
  const payloadHash = await sha256Hex(body)

  const canonicalRequest = [method, path, canonicalQS, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const canonicalRequestHash = await sha256Hex(canonicalRequest)
  const stringToSign = ['HMAC-SHA256', timestamp, credentialScope, canonicalRequestHash].join('\n')

  const kDate = await hmacSHA256(Buffer.from(secretAccessKey), dateStamp)
  const kRegion = await hmacSHA256(kDate, region)
  const kService = await hmacSHA256(kRegion, service)
  const kSigning = await hmacSHA256(kService, 'request')
  const signature = (await hmacSHA256(kSigning, stringToSign)).toString('hex')

  const authorization = `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  const host = headers['Host'] || ''
  const queryStr = canonicalQS ? `?${canonicalQS}` : ''

  return {
    url: `https://${host}${path}${queryStr}`,
    headers: { ...headers, 'X-Date': timestamp, 'Authorization': authorization, 'X-Content-Sha256': payloadHash },
    body,
  }
}

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

app.post('/api/ocr', async (req, res) => {
  try {
    const { image } = req.body
    if (!image) return res.status(400).json({ error: '缺少图片数据' })
    if (typeof image !== 'string' || image.length > 6_000_000) {
      return res.status(400).json({ error: '图片数据过大' })
    }

    const akId = process.env.VOLC_ACCESS_KEY_ID
    const akSecret = process.env.VOLC_SECRET_ACCESS_KEY

    // 优先正式方案
    if (akId && akSecret) {
      try {
        const body = JSON.stringify({ image_base64: image })
        const signed = await volcSign({
          method: 'POST', path: '/',
          query: { Action: 'OCRNormal', Version: '2020-08-26' },
          headers: { 'Host': 'visual.volcengineapi.com', 'Content-Type': 'application/json' },
          body, accessKeyId: akId, secretAccessKey: akSecret,
          service: 'cv', region: 'cn-north-1', date: new Date(),
        })

        const ocrRes = await fetch(signed.url, { method: 'POST', headers: signed.headers, body: signed.body })
        if (!ocrRes.ok) throw new Error(`火山 OCR HTTP ${ocrRes.status}`)

        const ocrData = await ocrRes.json() as { code?: number; message?: string; data?: { line_texts?: string[] } }
        if (ocrData.code && ocrData.code !== 10000) throw new Error(`火山 OCR ${ocrData.code}: ${ocrData.message}`)

        const text = ocrData.data?.line_texts?.join('\n') || ''
        console.log('[OCR] 火山 OCR 成功')
        return res.json({ text })
      } catch (volcErr) {
        console.error('[OCR] 火山 OCR 失败，尝试兜底:', volcErr)
      }
    }

    // 兜底：方舟视觉模型（临时方案）
    const arkKey = process.env.ARK_API_KEY
    const visionModel = process.env.ARK_VISION_MODEL_ID || process.env.ARK_MODEL_ID
    if (arkKey && visionModel) {
      console.warn('[OCR] 使用方舟视觉模型临时方案')
      const apiRes = await fetch(`${ARK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${arkKey}` },
        body: JSON.stringify({
          model: visionModel,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: '请识别这张图片中的所有文字和数学公式，只输出识别结果，不要解释或解答。保持原始排版格式。' },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
            ],
          }],
          max_tokens: 1024, temperature: 0.1,
        }),
      })

      if (!apiRes.ok) {
        const errBody = await apiRes.text()
        console.error('[OCR] 方舟视觉模型错误详情:', errBody)
        throw new Error(`方舟视觉 OCR HTTP ${apiRes.status}: ${errBody}`)
      }
      const result = await apiRes.json() as { choices?: Array<{ message?: { content?: string } }> }
      const text = result.choices?.[0]?.message?.content?.trim() || ''
      return res.json({ text })
    }

    res.status(500).json({ error: 'OCR 服务未配置' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR 处理失败'
    console.error('[OCR]', message)
    res.status(500).json({ error: message })
  }
})

// ===== /api/stt — 豆包语音识别（大模型录音文件极速版）=====
const STT_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash'

app.post('/api/stt', async (req, res) => {
  try {
    const { audio } = req.body
    if (!audio) return res.status(400).json({ error: '缺少音频数据' })
    if (typeof audio !== 'string' || audio.length > 14_000_000) {
      return res.status(400).json({ error: '音频数据过大' })
    }

    const appId = process.env.STT_APP_ID
    const accessToken = process.env.STT_ACCESS_TOKEN
    if (!appId || !accessToken) {
      return res.status(500).json({ error: '豆包 STT 未配置' })
    }

    console.log('[STT] 音频 base64 长度:', audio.length)

    const payload = {
      user: { uid: 'thinkbud-user' },
      audio: { data: audio, format: 'wav' },
      request: { model_name: 'bigmodel' },
    }

    const apiRes = await fetch(STT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-App-Key': appId,
        'X-Api-Access-Key': accessToken,
        'X-Api-Resource-Id': 'volc.bigasr.auc_turbo',
        'X-Api-Request-Id': randomUUID(),
        'X-Api-Sequence': '-1',
      },
      body: JSON.stringify(payload),
    })

    if (!apiRes.ok) {
      const errText = await apiRes.text()
      console.error('[STT] 豆包 STT HTTP 错误:', apiRes.status, errText)
      return res.status(502).json({ error: `豆包语音识别请求失败: ${apiRes.status}` })
    }

    const statusCode = apiRes.headers.get('X-Api-Status-Code')
    if (statusCode && statusCode !== '20000000') {
      const errText = await apiRes.text()
      console.error('[STT] 豆包 STT 状态错误:', statusCode, errText)
      return res.status(500).json({ error: `语音识别错误 (${statusCode})` })
    }

    const result = await apiRes.json() as { result?: { text?: string } }
    const text = result.result?.text || ''
    console.log('[STT] 识别结果:', text)
    res.json({ text })
  } catch (err) {
    const message = err instanceof Error ? err.message : '语音识别失败'
    console.error('[STT]', message)
    res.status(500).json({ error: message })
  }
})

// ===== /api/tts — 豆包语音合成 =====
const TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v1/tts'

app.post('/api/tts', async (req, res) => {
  const { text, rate } = req.body || {}
  if (!text) return res.status(400).json({ error: '缺少文本' })
  if (typeof text !== 'string' || text.length > 2000) {
    return res.status(400).json({ error: '文本过长（最大 2000 字符）' })
  }

  const appId = process.env.TTS_APP_ID
  const accessToken = process.env.TTS_ACCESS_TOKEN
  const cluster = process.env.TTS_CLUSTER || 'volcano_tts'
  const voiceType = process.env.TTS_VOICE_TYPE || 'zh_female_tianmeixiaoyuan_moon_bigtts'

  if (!appId || !accessToken) {
    return res.status(500).json({ error: '豆包 TTS 未配置' })
  }

  // 前端 rate 0.5-2.0 直接映射到豆包 speed_ratio（范围 0.2-3.0 已覆盖）
  const speedRatio = typeof rate === 'number' && rate >= 0.5 && rate <= 2.0
    ? Math.round(rate * 10) / 10
    : 1.0

  try {
    const payload = {
      app: { appid: appId, token: 'access_token', cluster },
      user: { uid: 'thinkbud-user' },
      audio: { voice_type: voiceType, encoding: 'mp3', speed_ratio: speedRatio, volume_ratio: 1.0, pitch_ratio: 1.0 },
      request: { reqid: randomUUID(), text, operation: 'query' },
    }

    const apiRes = await fetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer;${accessToken}` },
      body: JSON.stringify(payload),
    })

    if (!apiRes.ok) {
      const errText = await apiRes.text()
      console.error('[TTS] 豆包 TTS HTTP 错误:', apiRes.status, errText)
      return res.status(502).json({ error: `豆包 TTS 请求失败: ${apiRes.status}` })
    }

    const result = await apiRes.json() as { code: number; message: string; data?: string }

    if (result.code !== 3000 || !result.data) {
      console.error('[TTS] 豆包 TTS 错误:', result.code, result.message)
      return res.status(500).json({ error: `豆包 TTS 错误 (${result.code}): ${result.message}` })
    }

    const audioBuffer = Buffer.from(result.data, 'base64')
    console.log('[TTS] 豆包 TTS 成功，音频大小:', audioBuffer.length, 'bytes')
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Length', audioBuffer.length)
    res.send(audioBuffer)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS 处理失败'
    console.error('[TTS]', message)
    res.status(500).json({ error: message })
  }
})

// ===== 启动 =====
const PORT = 3001
app.listen(PORT, () => {
  console.log(`API 开发服务器运行在 http://localhost:${PORT}`)
  console.log(`   /api/chat  → 火山方舟`)
  console.log(`   /api/ocr   → 火山引擎 OCR`)
  console.log(`   /api/stt   → 豆包语音识别`)
  console.log(`   /api/tts   → 豆包语音合成`)
})
