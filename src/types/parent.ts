// Parent Dashboard type contracts (Phase 15 -- PARENT-01)

export interface CoachNote {
  topic: string
  stuck_at: string | null
  strategies: string[]
  highlight_quote: string | null
  summary: string
}

export type ColdStartState = 'getting-to-know' | 'subject-level' | 'concept-level'

export function getColdStartState(totalConversations: number): ColdStartState {
  if (totalConversations <= 2) return 'getting-to-know'
  if (totalConversations <= 5) return 'subject-level'
  return 'concept-level'
}

export function confidenceToLabel(confidence: number): { label: string; level: 'low' | 'mid' | 'high' } {
  if (confidence < 0.4) return { label: '正在探索', level: 'low' }
  if (confidence <= 0.7) return { label: '逐渐掌握', level: 'mid' }
  return { label: '已经很熟练', level: 'high' }
}

export interface ParentReport {
  range: '7d' | '30d' | 'all'
  totalConversations: number
  childName: string | null

  reassurance: {
    weeklyCount: number
    narrative: string
  }

  stats: {
    totalSessions: number
    avgDurationMinutes: number
    independenceRate: number
    mostPracticedSubject: string | null
  }

  subjectProgress: Array<{
    subject: string
    count: number
    masteryLabel: string
    avgConfidence: number
  }>

  weakPoints: Array<{
    concept: string
    label: string
    subject: string
  }>

  highlights: Array<{
    date: string
    subject: string | null
    summary: string
    highlightQuote: string | null
  }>

  conversations: Array<{
    id: string
    date: string
    durationMinutes: number | null
    subject: string | null
    topic: string | null
    strategies: string[]
    resolutionType: string | null
  }>

  dailyActivity: Array<{ date: string; count: number }>
}
