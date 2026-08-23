import type { WhiteboardStep } from './whiteboard'
import type { Subject, GradeLevel } from '../../shared/types'

export type { Subject, GradeLevel } from '../../shared/types'

export const GRADE_LABELS: Record<GradeLevel, string> = {
  lower: '1-3年级',
  upper: '4-6年级',
}

export type EmotionType = '正常' | '困惑' | '沮丧' | '兴奋' | '自信' | '惊喜' | '好奇' | '困倦' | '专注'

export const EMOTION_EMOJI: Record<EmotionType, string> = {
  '正常': '😊',
  '困惑': '🤔',
  '沮丧': '😢',
  '兴奋': '🎉',
  '自信': '💪',
  '惊喜': '🤩',
  '好奇': '🧐',
  '困倦': '😴',
  '专注': '🎯',
}

export type StudentMood = 'happy' | 'confused' | 'frustrated'

export type SessionPhase = 'variant_asked' | 'session_complete'

export type ResolutionType = 'independent' | 'guided' | 'unresolved'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  emotion?: EmotionType
  thinkingNode?: string
  sessionPhase?: SessionPhase
  studentMood?: StudentMood
  imageUrl?: string
  complianceIssues?: string[]
  steps?: WhiteboardStep[]
}

export interface SessionAnalytics {
  strategiesUsed: string[]
  emotionArc: EmotionType[]
  hintCount: number
  resolutionType: ResolutionType
  struggleDuration?: number  // ms between first frustration and resolution
}

export interface Session {
  id: string
  gradeLevel: GradeLevel
  ocrText?: string
  imageUrl?: string
  messages: ChatMessage[]
  resolved: boolean
  completedAt?: number
  createdAt: number
  updatedAt: number
  analytics?: SessionAnalytics
}

export interface LearnerProfile {
  id: 'default'
  frequentErrors: Record<string, number>   // error pattern → count
  preferredStrategies: string[]             // sorted by usage
  totalSessions: number
  totalResolved: number
  updatedAt: number
}


/** Shape stored in IndexedDB knowledgePoints store */
export interface KnowledgePointRecord {
  key: string             // composite: `${userId}:${subject}:${concept}` e.g. "abc123:math:carrying"
  userId: string
  concept: string         // KC key, English slug e.g. "carrying"
  subject: Subject
  label: string           // Chinese display label e.g. "进位加法"
  confidence: number      // float 0.0-1.0, NEVER boolean
  encounters: number      // total times this concept appeared across sessions
  masterySignals: number  // sessions where child showed understanding
  struggleSignals: number // sessions where child showed difficulty
  lastSeen: number        // Date.now() timestamp
  createdAt: number       // Date.now() timestamp
}

/** Shape returned by /api/extract-knowledge for a single extracted point */
export interface KnowledgePoint {
  concept: string         // KC key or new concept string
  subject: Subject
  label: string           // Chinese display label
  signal: 'mastery' | 'struggle' | 'neutral'
}

export type { WhiteboardStep } from './whiteboard'

export type InteractionPhase = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking'
