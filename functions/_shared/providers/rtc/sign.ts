// 火山引擎 V4 API 签名（Cloudflare Workers 兼容）
// 参考: https://www.volcengine.com/docs/6369/67269
// 使用 Web Crypto API 替代 Node.js crypto

const ALGORITHM = 'HMAC'
const HASH = 'SHA-256'

/** 对火山引擎 OpenAPI 请求进行 V4 签名 */
export async function signRequest(params: {
  method: string
  url: string
  body: string
  accessKeyId: string
  secretAccessKey: string
  service: string
  region?: string
}): Promise<Record<string, string>> {
  const { method, url, body, accessKeyId, secretAccessKey, service, region = 'cn-north-1' } = params

  const parsedUrl = new URL(url)
  const now = new Date()
  const dateStamp = formatDate(now)
  const amzDate = formatAmzDate(now)

  const credentialScope = `${dateStamp}/${region}/${service}/request`

  // 计算 body hash
  const payloadHash = await sha256Hex(body)

  // 规范请求
  const canonicalHeaders = [
    `content-type:application/json`,
    `host:${parsedUrl.host}`,
    `x-content-sha256:${payloadHash}`,
    `x-date:${amzDate}`,
  ].join('\n') + '\n'

  const signedHeaders = 'content-type;host;x-content-sha256;x-date'

  const canonicalRequest = [
    method,
    parsedUrl.pathname,
    parsedUrl.search.slice(1), // 去掉 ?
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  // 待签字符串
  const stringToSign = [
    'HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  // 派生签名密钥
  const kDate = await hmacSha256(new TextEncoder().encode(secretAccessKey), dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  const kSigning = await hmacSha256(kService, 'request')

  // 计算签名
  const signatureBytes = await hmacSha256(kSigning, stringToSign)
  const signature = hexEncode(signatureBytes)

  const authorization = `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    'Content-Type': 'application/json',
    'Host': parsedUrl.host,
    'X-Date': amzDate,
    'X-Content-Sha256': payloadHash,
    'Authorization': authorization,
  }
}

async function hmacSha256(key: ArrayBuffer | Uint8Array | string, message: string): Promise<Uint8Array> {
  const keyData = typeof key === 'string' ? new TextEncoder().encode(key) : key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: ALGORITHM, hash: HASH },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign(ALGORITHM, cryptoKey, new TextEncoder().encode(message))
  return new Uint8Array(sig)
}

async function sha256Hex(message: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))
  return hexEncode(new Uint8Array(hash))
}

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '')
}
