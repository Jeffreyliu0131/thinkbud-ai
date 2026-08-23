// Mirror of src/hooks/useChat.ts parseMetaFromContent — keep in sync
interface MetaData {
  emotion?: string
  thinking_node?: string
  session_phase?: string
  steps?: Array<{
    id: number
    label: string
    math?: string
    highlight?: string
    hint?: string
  }>
}

export function parseMetaFromContent(content: string): {
  cleanContent: string
  meta: MetaData | null
} {
  const metaPattern = /-{0,3}\s*META\s*-{0,3}/
  const match = content.match(metaPattern)

  if (!match || match.index === undefined) {
    const jsonTrail = content.match(/\s*\{["\s]*emotion[\s\S]*$/)
    if (jsonTrail && jsonTrail.index !== undefined) {
      return { cleanContent: content.substring(0, jsonTrail.index).trim(), meta: null }
    }
    return { cleanContent: content, meta: null }
  }

  const cleanContent = content.substring(0, match.index).trim()
  const metaStr = content.substring(match.index + match[0].length).trim()

  try {
    let fixed = metaStr
    if (!fixed.startsWith('{')) {
      const braceIdx = fixed.indexOf('{')
      fixed = braceIdx >= 0 ? fixed.substring(braceIdx) : '{' + fixed
    }
    if (!fixed.endsWith('}')) {
      const lastBrace = fixed.lastIndexOf('}')
      fixed = lastBrace >= 0 ? fixed.substring(0, lastBrace + 1) : fixed + '}'
    }
    fixed = fixed.replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":')
    fixed = fixed.replace(/:([^"{}[\],\s][^,}]*)/g, (_, v) => ':"' + v.trim() + '"')

    const meta = JSON.parse(fixed) as MetaData
    return { cleanContent, meta }
  } catch {
    return { cleanContent, meta: null }
  }
}
