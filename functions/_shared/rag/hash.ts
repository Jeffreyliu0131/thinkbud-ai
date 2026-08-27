const encoder = new TextEncoder()

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function canonicalPart(value: string | number): string {
  return String(value).normalize('NFKC').trim().toLowerCase()
}

export async function stableTextbookId(
  prefix: 'src' | 'doc' | 'ch' | 'sec' | 'chk',
  parts: Array<string | number>,
): Promise<string> {
  const digest = await sha256Hex(parts.map(canonicalPart).join('\u001f'))
  return `${prefix}_${digest.slice(0, 24)}`
}
