// 火山引擎 OpenAPI V4 签名工具
// 用于调用火山引擎 OCR 等需要 AK/SK 签名的服务
// 使用 Web Crypto API，兼容 Cloudflare Workers
// 修复：x-date 和 x-content-sha256 必须参与签名（对齐 RTC sign 模块）

const ALGORITHM = 'HMAC-SHA256'

async function hmacSHA256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
}

async function sha256(message: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))
  return arrayBufferToHex(hash)
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function getDateStamp(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function getTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

interface SignParams {
  method: string
  path: string
  query: Record<string, string>
  headers: Record<string, string>
  body: string
  accessKeyId: string
  secretAccessKey: string
  service: string
  region: string
  date: Date
}

export interface SignedRequest {
  url: string
  headers: Record<string, string>
  body: string
}

/**
 * 火山引擎 V4 签名
 * 参考: https://www.volcengine.com/docs/6369/67269
 *
 * 关键修复：x-date 和 x-content-sha256 必须在签名时就包含在 canonical headers 中，
 * 否则服务端验签失败。此前的实现只签名了 content-type 和 host。
 */
export async function signRequest(params: SignParams): Promise<SignedRequest> {
  const { method, path, query, body, accessKeyId, secretAccessKey, service, region, date } = params

  const timestamp = getTimestamp(date)
  const dateStamp = getDateStamp(date)
  const credentialScope = `${dateStamp}/${region}/${service}/request`

  // 计算 payload hash
  const payloadHash = await sha256(body)

  // 提取 Host（从传入 headers 中）
  const host = params.headers['Host'] || params.headers['host'] || ''

  // 1. 构造规范请求
  // 查询参数排序
  const sortedQueryKeys = Object.keys(query).sort()
  const canonicalQueryString = sortedQueryKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join('&')

  // 签名头必须包含 x-date 和 x-content-sha256（V4 规范要求）
  const signedHeaders = 'content-type;host;x-content-sha256;x-date'
  const canonicalHeaders = [
    `content-type:application/json`,
    `host:${host}`,
    `x-content-sha256:${payloadHash}`,
    `x-date:${timestamp}`,
  ].join('\n') + '\n'

  const canonicalRequest = [
    method,
    path,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  // 2. 构造待签名字符串
  const canonicalRequestHash = await sha256(canonicalRequest)
  const stringToSign = [
    ALGORITHM,
    timestamp,
    credentialScope,
    canonicalRequestHash,
  ].join('\n')

  // 3. 计算签名
  const kDate = await hmacSHA256(new TextEncoder().encode(secretAccessKey), dateStamp)
  const kRegion = await hmacSHA256(kDate, region)
  const kService = await hmacSHA256(kRegion, service)
  const kSigning = await hmacSHA256(kService, 'request')
  const signature = arrayBufferToHex(await hmacSHA256(kSigning, stringToSign))

  // 4. 构造 Authorization
  const authorization = `${ALGORITHM} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  // 5. 构造完整 URL
  const queryStr = canonicalQueryString ? `?${canonicalQueryString}` : ''
  const url = `https://${host}${path}${queryStr}`

  return {
    url,
    headers: {
      'Content-Type': 'application/json',
      'Host': host,
      'X-Date': timestamp,
      'X-Content-Sha256': payloadHash,
      'Authorization': authorization,
    },
    body,
  }
}
