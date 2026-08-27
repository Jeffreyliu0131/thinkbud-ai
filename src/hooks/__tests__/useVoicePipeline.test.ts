import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { INITIAL_CHAT_STATE } from '../../types/chatState'
import type { useChat } from '../useChat'

const mocks = vi.hoisted(() => ({
  prefetchRTCSDK: vi.fn(),
  rtc: {
    isConnected: false,
    phase: 'idle',
    error: null,
    debugLogs: [],
    connect: vi.fn().mockResolvedValue(false),
    disconnect: vi.fn(),
    setConversationId: vi.fn(),
  },
  stt: {
    startListening: vi.fn(),
    stopListening: vi.fn(),
  },
  tts: {
    speak: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  },
}))

vi.mock('../useRTCVoice', () => ({
  prefetchRTCSDK: mocks.prefetchRTCSDK,
  useRTCVoice: () => mocks.rtc,
}))

vi.mock('../useSpeech', () => ({
  unlockAudioContext: vi.fn(),
  useSTT: () => mocks.stt,
  useTTS: () => mocks.tts,
}))

vi.mock('../../lib/knowledgeExtractor', () => ({
  extractAndSyncKnowledge: vi.fn().mockResolvedValue(undefined),
}))

import { useVoicePipeline } from '../useVoicePipeline'

const chat = {
  messages: [],
  isStreaming: false,
  onFirstSentenceRef: { current: null },
  addMessage: vi.fn(),
} as unknown as ReturnType<typeof useChat>

function useSubject(useRTC: boolean) {
  return useVoicePipeline({
    gradeLevel: 'upper',
    dispatch: vi.fn(),
    state: { ...INITIAL_CHAT_STATE, useRTC },
    chat,
    onVoiceResult: vi.fn().mockResolvedValue(undefined),
    showToast: vi.fn(),
    conversationRef: { current: false },
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useVoicePipeline RTC SDK loading', () => {
  it('does not prefetch the 1.29 MB SDK while RTC is default-off', () => {
    renderHook(() => useSubject(false))

    expect(mocks.prefetchRTCSDK).not.toHaveBeenCalled()
  })

  it('prefetches only after the explicit RTC state is enabled', async () => {
    const { rerender } = renderHook(
      ({ useRTC }) => useSubject(useRTC),
      { initialProps: { useRTC: false } },
    )

    rerender({ useRTC: true })

    await waitFor(() => expect(mocks.prefetchRTCSDK).toHaveBeenCalledTimes(1))
  })
})
