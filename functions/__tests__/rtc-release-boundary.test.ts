import { describe, it, expect, vi } from 'vitest'
import { onRequestPost } from '../api/rtc-token'

describe('RTC token release boundary', () => {
  it.each([undefined, 'false', 'TRUE', '1'])('rejects token creation when server flag is %s', async (flag) => {
    const json = vi.fn()
    const response = await onRequestPost({
      env: { RTC_ENABLED: flag }, data: { userId: 'synthetic-user' }, request: { json },
    } as never)
    expect(response.status).toBe(503)
    expect(json).not.toHaveBeenCalled()
  })
  it('preserves identity checking when explicitly enabled', async () => {
    const response = await onRequestPost({
      env: { RTC_ENABLED: 'true' }, data: { userId: 'synthetic-user' },
      request: { json: async () => ({ roomId: 'room', userId: 'another-user' }) },
    } as never)
    expect(response.status).toBe(403)
  })
})
