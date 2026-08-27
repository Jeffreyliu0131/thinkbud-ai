import type { InteractionPhase } from './index'

export type ChatSessionPhase = 'active' | 'variant' | 'completed'

export interface ChatState {
  phase: InteractionPhase
  imageUrl: string | null
  ocrText: string | null
  sessionPhase: ChatSessionPhase
  useRTC: boolean
  rtcSubtitle: string
}

export const INITIAL_CHAT_STATE: ChatState = {
  phase: 'idle',
  imageUrl: null,
  ocrText: null,
  sessionPhase: 'active',
  // ArkV3 RTC speaks model output before the app can run its output guard.
  // Keep it opt-in until fresh live eval + human review approve that path.
  useRTC: import.meta.env.VITE_ENABLE_RTC === 'true',
  rtcSubtitle: '',
}

export type ChatAction =
  | { type: 'SET_PHASE'; phase: InteractionPhase }
  | { type: 'SET_IMAGE'; imageUrl: string | null }
  | { type: 'SET_OCR'; ocrText: string | null }
  | { type: 'SET_SESSION_PHASE'; sessionPhase: ChatSessionPhase }
  | { type: 'FALLBACK_TO_STT' }
  | { type: 'SET_RTC_SUBTITLE'; text: string }
  | { type: 'COMPLETE_SESSION' }
  | { type: 'SWITCH_PROBLEM' }

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase }
    case 'SET_IMAGE':
      return { ...state, imageUrl: action.imageUrl }
    case 'SET_OCR':
      return { ...state, ocrText: action.ocrText }
    case 'SET_SESSION_PHASE':
      return { ...state, sessionPhase: action.sessionPhase }
    case 'FALLBACK_TO_STT':
      return { ...state, useRTC: false }
    case 'SET_RTC_SUBTITLE':
      return { ...state, rtcSubtitle: action.text }
    case 'COMPLETE_SESSION':
      return { ...state, sessionPhase: 'completed', phase: 'idle' }
    case 'SWITCH_PROBLEM':
      return { ...state, imageUrl: null, ocrText: null }
    default:
      return state
  }
}
