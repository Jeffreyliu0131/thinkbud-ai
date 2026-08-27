export type VoiceFailureKind =
  | 'rtc_connect'
  | 'rtc_health_timeout'
  | 'rtc_mid_session'
  | 'stt_empty'
  | 'usage_limit'

export type FailureAction = 'retry_stt' | 'fallback_stt' | 'stop'

export interface VoiceFailureInput {
  kind: VoiceFailureKind
  detail?: string
  retryCount?: number
}

export interface VoiceFailureDecision {
  action: FailureAction
  message: string
  preserveConversation: boolean
}

export function friendlyVoiceError(detail = ''): string {
  const normalized = detail.toLowerCase()
  if (detail.includes('麦克风') || normalized.includes('mic') || normalized.includes('permission')) {
    return '哦，我好像没听到，能让我用一下麦克风吗？'
  }
  return '哦，我好像没听清楚，能再说一次吗？'
}

export function decideVoiceFailure(input: VoiceFailureInput): VoiceFailureDecision {
  if (input.kind === 'usage_limit') {
    return {
      action: 'stop',
      message: input.detail || '今天先把想到的写在纸上，明天再来。',
      preserveConversation: false,
    }
  }

  if (input.kind === 'stt_empty') {
    const retryCount = input.retryCount ?? 0
    if (retryCount <= 3) {
      return { action: 'retry_stt', message: '', preserveConversation: true }
    }
    return {
      action: 'stop',
      message: friendlyVoiceError('麦克风启动失败'),
      preserveConversation: false,
    }
  }

  if (input.kind === 'rtc_health_timeout') {
    return {
      action: 'fallback_stt',
      message: '语音识别未响应，已切换到普通模式',
      preserveConversation: true,
    }
  }

  const friendly = friendlyVoiceError(input.detail).replace(/[?？]$/, '')
  return {
    action: 'fallback_stt',
    message: `${friendly}，已切换到普通模式`,
    preserveConversation: true,
  }
}

/** Preserve useful SSE content and mark that it is incomplete. */
export function formatInterruptedStreamContent(currentContent: string, errorMessage: string): string {
  const partial = currentContent.trim()
  return partial ? `${partial}\n\n[${errorMessage}]` : errorMessage
}
