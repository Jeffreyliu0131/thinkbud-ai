import { describe, it, expect, vi } from 'vitest'
import { checkSendRateLimit, checkAdminRateLimit, recordAdminAttempt } from '../_shared/db'

// ── Mock D1Database ──────────────────────────────────────

function createMockDB(firstResult?: { cnt: number } | null) {
  const mockFirst = vi.fn().mockResolvedValue(firstResult ?? null)
  const mockRun = vi.fn().mockResolvedValue({ success: true })
  const mockBind = vi.fn(() => ({ first: mockFirst, run: mockRun }))
  const mockPrepare = vi.fn(() => ({ bind: mockBind, run: mockRun }))

  return {
    db: { prepare: mockPrepare } as unknown as D1Database,
    mockPrepare,
    mockBind,
    mockFirst,
    mockRun,
  }
}

// ── 短信发送限流 ──────────────────────────────────────

describe('checkSendRateLimit', () => {
  it('无历史记录时允许发送', async () => {
    const { db, mockFirst } = createMockDB()
    mockFirst
      .mockResolvedValueOnce({ cnt: 0 }) // 60秒内
      .mockResolvedValueOnce({ cnt: 0 }) // 每日

    const result = await checkSendRateLimit(db, 'hash123')
    expect(result.allowed).toBe(true)
  })

  it('60秒内已发送则拒绝', async () => {
    const { db, mockFirst } = createMockDB()
    mockFirst.mockResolvedValueOnce({ cnt: 1 }) // 60秒内已有

    const result = await checkSendRateLimit(db, 'hash123')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('60秒')
  })

  it('每日超过10次则拒绝', async () => {
    const { db, mockFirst } = createMockDB()
    mockFirst
      .mockResolvedValueOnce({ cnt: 0 }) // 60秒内没有
      .mockResolvedValueOnce({ cnt: 10 }) // 但今日已10次

    const result = await checkSendRateLimit(db, 'hash123')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('上限')
  })

  it('正确传递 phoneHash 参数', async () => {
    const { db, mockBind, mockFirst } = createMockDB()
    mockFirst
      .mockResolvedValueOnce({ cnt: 0 })
      .mockResolvedValueOnce({ cnt: 0 })

    await checkSendRateLimit(db, 'my-phone-hash')
    expect(mockBind).toHaveBeenCalledWith('my-phone-hash')
  })
})

// ── Admin 登录限流 ──────────────────────────────────────

describe('checkAdminRateLimit', () => {
  it('无失败记录时允许登录', async () => {
    const { db, mockFirst } = createMockDB()
    mockFirst.mockResolvedValueOnce({ cnt: 0 })

    const result = await checkAdminRateLimit(db, 'ip-hash')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(5)
  })

  it('失败 4 次仍允许（剩余 1 次）', async () => {
    const { db, mockFirst } = createMockDB()
    mockFirst.mockResolvedValueOnce({ cnt: 4 })

    const result = await checkAdminRateLimit(db, 'ip-hash')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(1)
  })

  it('失败 5 次后拒绝', async () => {
    const { db, mockFirst } = createMockDB()
    mockFirst.mockResolvedValueOnce({ cnt: 5 })

    const result = await checkAdminRateLimit(db, 'ip-hash')
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('null 结果视为 0 次失败', async () => {
    const { db, mockFirst } = createMockDB()
    mockFirst.mockResolvedValueOnce(null)

    const result = await checkAdminRateLimit(db, 'ip-hash')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(5)
  })
})

// ── 记录 Admin 登录尝试 ──────────────────────────────────

describe('recordAdminAttempt', () => {
  it('记录失败尝试（success=0）', async () => {
    const { db, mockBind } = createMockDB()
    await recordAdminAttempt(db, 'ip-hash', false)
    expect(mockBind).toHaveBeenCalledWith('ip-hash', 0)
  })

  it('记录成功尝试（success=1）', async () => {
    const { db, mockBind } = createMockDB()
    await recordAdminAttempt(db, 'ip-hash', true)
    expect(mockBind).toHaveBeenCalledWith('ip-hash', 1)
  })
})
