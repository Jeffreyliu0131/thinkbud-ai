// 火山引擎 RTC Token 生成（Cloudflare Workers 兼容）
// 参考: https://www.volcengine.com/docs/6348/70121
// 使用 Web Crypto API 替代 Node.js crypto

const VERSION = '001'
const PRIV_PUBLISH_STREAM = 0
const PRIV_PUBLISH_AUDIO_STREAM = 1
const PRIV_PUBLISH_VIDEO_STREAM = 2
const PRIV_PUBLISH_DATA_STREAM = 3
const PRIV_SUBSCRIBE_STREAM = 4

/** 生成加入 RTC 房间所需的 Token */
export async function generateRTCToken(params: {
  appId: string
  appKey: string
  roomId: string
  userId: string
  /** Token 过期时间（秒），默认 24 小时 */
  expireSeconds?: number
}): Promise<string> {
  const { appId, appKey, roomId, userId, expireSeconds = 86400 } = params

  const now = Math.floor(Date.now() / 1000)
  const expire = now + expireSeconds
  const nonce = Math.floor(Math.random() * 0xFFFFFFFF)

  // 构建权限 map: { privilege: expireTime }
  // publish 展开为 0,1,2,3；subscribe 为 4
  const privileges = new Map<number, number>()
  privileges.set(PRIV_PUBLISH_STREAM, expire)
  privileges.set(PRIV_PUBLISH_AUDIO_STREAM, expire)
  privileges.set(PRIV_PUBLISH_VIDEO_STREAM, expire)
  privileges.set(PRIV_PUBLISH_DATA_STREAM, expire)
  privileges.set(PRIV_SUBSCRIBE_STREAM, expire)

  // 打包消息（小端序）
  const message = packMessage(nonce, now, expire, roomId, userId, privileges)
  const msgBytes = new Uint8Array(message)

  // HMAC-SHA256 签名
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))

  // 官方格式：putBytes(msg) + putBytes(sig)
  // 每段 = uint16 LE 长度 + 字节内容
  const totalLen = 2 + msgBytes.length + 2 + signature.length
  const combined = new Uint8Array(totalLen)
  const view = new DataView(combined.buffer)
  let offset = 0

  view.setUint16(offset, msgBytes.length, true)
  offset += 2
  combined.set(msgBytes, offset)
  offset += msgBytes.length

  view.setUint16(offset, signature.length, true)
  offset += 2
  combined.set(signature, offset)

  const base64 = btoa(String.fromCharCode(...combined))

  return VERSION + appId + base64
}

/** 按小端序打包二进制消息 */
function packMessage(
  nonce: number,
  issuedAt: number,
  expireAt: number,
  roomId: string,
  userId: string,
  privileges: Map<number, number>
): ArrayBuffer {
  const roomIdBytes = new TextEncoder().encode(roomId)
  const userIdBytes = new TextEncoder().encode(userId)

  // 计算总长度
  // nonce(4) + issuedAt(4) + expireAt(4)
  // + roomIdLen(2) + roomId + userIdLen(2) + userId
  // + privCount(2) + privileges(key:2 + value:4 each)
  const totalLen =
    4 + 4 + 4 +
    2 + roomIdBytes.length +
    2 + userIdBytes.length +
    2 + privileges.size * 6

  const buffer = new ArrayBuffer(totalLen)
  const view = new DataView(buffer)
  let offset = 0

  // nonce (uint32 LE)
  view.setUint32(offset, nonce, true)
  offset += 4

  // issuedAt (uint32 LE)
  view.setUint32(offset, issuedAt, true)
  offset += 4

  // expireAt (uint32 LE)
  view.setUint32(offset, expireAt, true)
  offset += 4

  // roomId (uint16 LE length + bytes)
  view.setUint16(offset, roomIdBytes.length, true)
  offset += 2
  new Uint8Array(buffer, offset, roomIdBytes.length).set(roomIdBytes)
  offset += roomIdBytes.length

  // userId (uint16 LE length + bytes)
  view.setUint16(offset, userIdBytes.length, true)
  offset += 2
  new Uint8Array(buffer, offset, userIdBytes.length).set(userIdBytes)
  offset += userIdBytes.length

  // privileges count (uint16 LE)
  view.setUint16(offset, privileges.size, true)
  offset += 2

  // each privilege: key(uint16 LE) + value(uint32 LE)
  for (const [key, value] of privileges) {
    view.setUint16(offset, key, true)
    offset += 2
    view.setUint32(offset, value, true)
    offset += 4
  }

  return buffer
}
