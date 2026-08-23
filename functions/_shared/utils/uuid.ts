// 简易 UUID v4 生成（兼容 Cloudflare Workers）
export function generateUUID(): string {
  return crypto.randomUUID()
}
