import { describe, expect, it } from 'vitest'
import {
  decideVoiceFailure,
  formatInterruptedStreamContent,
} from '../failurePolicy'

describe('failurePolicy', () => {
  it('falls back from RTC health timeout while preserving the conversation', () => {
    expect(decideVoiceFailure({ kind: 'rtc_health_timeout' })).toMatchObject({
      action: 'fallback_stt',
      preserveConversation: true,
    })
  })

  it('falls back after a mid-session RTC error', () => {
    const decision = decideVoiceFailure({ kind: 'rtc_mid_session', detail: 'network disconnected' })
    expect(decision.action).toBe('fallback_stt')
    expect(decision.message).toContain('已切换到普通模式')
  })

  it('bounds STT retries at three', () => {
    expect(decideVoiceFailure({ kind: 'stt_empty', retryCount: 3 }).action).toBe('retry_stt')
    expect(decideVoiceFailure({ kind: 'stt_empty', retryCount: 4 }).action).toBe('stop')
  })

  it('does not convert a usage limit into a paid fallback loop', () => {
    expect(decideVoiceFailure({ kind: 'usage_limit', detail: '明天再来' })).toMatchObject({
      action: 'stop',
      preserveConversation: false,
    })
  })

  it('preserves partial SSE content and marks it incomplete', () => {
    expect(formatInterruptedStreamContent('先看看等号左边', '连接中断'))
      .toBe('先看看等号左边\n\n[连接中断]')
  })

  it('uses the error message when no SSE content arrived', () => {
    expect(formatInterruptedStreamContent('  ', '连接中断')).toBe('连接中断')
  })
})
