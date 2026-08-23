import type { ChatMessage, EmotionType, ResolutionType, SessionAnalytics } from '../types'

/** 从数学策略关键词中提取策略名 */
const STRATEGY_PATTERNS: Array<[RegExp, string]> = [
  [/凑十/, '凑十法'],
  [/拆分/, '拆分法'],
  [/数数/, '数数法'],
  [/竖式/, '竖式计算'],
  [/画图/, '画图法'],
  [/列式/, '列式法'],
  [/倒推/, '倒推法'],
  [/估算/, '估算法'],
]

function extractStrategies(messages: ChatMessage[]): string[] {
  const found = new Set<string>()
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    for (const [re, name] of STRATEGY_PATTERNS) {
      if (re.test(msg.content)) found.add(name)
    }
  }
  return Array.from(found)
}

function extractEmotionArc(messages: ChatMessage[]): EmotionType[] {
  return messages
    .filter((m) => m.role === 'assistant' && m.emotion)
    .map((m) => m.emotion!)
}

function computeHintCount(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === 'assistant').length
}

function computeResolutionType(resolved: boolean, hintCount: number): ResolutionType {
  if (!resolved) return 'unresolved'
  return hintCount <= 3 ? 'independent' : 'guided'
}

function computeStruggleDuration(messages: ChatMessage[]): number | undefined {
  const struggle = ['困惑', '沮丧', '困倦'] as const
  const positive = ['兴奋', '自信', '惊喜', '专注'] as const

  let firstStruggleTs: number | undefined
  let resolutionTs: number | undefined

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.emotion) continue
    if (!firstStruggleTs && (struggle as readonly string[]).includes(msg.emotion)) {
      firstStruggleTs = msg.timestamp
    }
    if (firstStruggleTs && (positive as readonly string[]).includes(msg.emotion)) {
      resolutionTs = msg.timestamp
    }
  }

  if (firstStruggleTs && resolutionTs) {
    return resolutionTs - firstStruggleTs
  }
  return undefined
}

export function computeSessionAnalytics(
  messages: ChatMessage[],
  resolved: boolean
): SessionAnalytics {
  const hintCount = computeHintCount(messages)
  return {
    strategiesUsed: extractStrategies(messages),
    emotionArc: extractEmotionArc(messages),
    hintCount,
    resolutionType: computeResolutionType(resolved, hintCount),
    struggleDuration: computeStruggleDuration(messages),
  }
}
