import { describe, expect, it } from 'vitest'
import { chatReducer, INITIAL_CHAT_STATE } from '../chatState'

describe('chat RTC release default', () => {
  it('keeps managed RTC disabled when the explicit build flag is absent', () => {
    expect(import.meta.env.VITE_ENABLE_RTC).not.toBe('true')
    expect(INITIAL_CHAT_STATE.useRTC).toBe(false)
  })

  it('keeps fallback one-way from RTC to the guarded STT/text path', () => {
    const state = chatReducer({ ...INITIAL_CHAT_STATE, useRTC: true }, { type: 'FALLBACK_TO_STT' })

    expect(state.useRTC).toBe(false)
  })
})
