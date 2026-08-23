import { describe, it, expect, vi } from 'vitest'
import { verifyCode, saveVerificationCode, checkSendRateLimit } from '../_shared/db'

// ── Mock constantTimeCompare ──────────────────────────────
vi.mock('../_shared/auth', () => ({
  constantTimeCompare: vi.fn(async (a: string, b: string) => a === b),
}))

// ── Mock D1Database ──────────────────────────────────────

interface MockDBOptions {
  firstResults?: Array<Record<string, unknown> | null>
}

function createMockDB(options?: MockDBOptions) {
  const firstResults = options?.firstResults ?? []
  let firstCallIndex = 0

  const mockRun = vi.fn().mockResolvedValue({ success: true })
  const mockFirst = vi.fn().mockImplementation(() => {
    const result = firstResults[firstCallIndex] ?? null
    firstCallIndex++
    return Promise.resolve(result)
  })
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

// ── Phone regex validation ──────────────────────────────
const PHONE_REGEX = /^1[3-9]\d{9}$/

describe('Phone validation regex', () => {
  it('valid phone 13800138000 passes', () => {
    expect(PHONE_REGEX.test('13800138000')).toBe(true)
  })

  it('valid phone 19999999999 passes', () => {
    expect(PHONE_REGEX.test('19999999999')).toBe(true)
  })

  it('too short "1234" fails', () => {
    expect(PHONE_REGEX.test('1234')).toBe(false)
  })

  it('wrong prefix "03800138000" fails', () => {
    expect(PHONE_REGEX.test('03800138000')).toBe(false)
  })

  it('wrong second digit "12345678901" fails', () => {
    expect(PHONE_REGEX.test('12345678901')).toBe(false)
  })

  it('too long "138001380001" fails', () => {
    expect(PHONE_REGEX.test('138001380001')).toBe(false)
  })
})

// ── verifyCode ──────────────────────────────────────

describe('verifyCode', () => {
  it('no matching row (expired) -> valid:false, reason contains 过期', async () => {
    const { db } = createMockDB({ firstResults: [null] })
    const result = await verifyCode(db, 'hash123', '123456')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('过期')
  })

  it('attempts >= 3 -> valid:false, reason contains 错误次数', async () => {
    const { db } = createMockDB({
      firstResults: [{ id: 1, code: '123456', attempts: 3 }],
    })
    const result = await verifyCode(db, 'hash123', '123456')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('错误次数')
  })

  it('wrong code -> valid:false, attempts incremented', async () => {
    const { db, mockPrepare } = createMockDB({
      firstResults: [{ id: 42, code: '123456', attempts: 0 }],
    })
    const result = await verifyCode(db, 'hash123', '999999')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('错误')
    // Check UPDATE was called to increment attempts
    const updateCalls = mockPrepare.mock.calls.filter(
      (c: string[]) => typeof c[0] === 'string' && c[0].includes('UPDATE')
    )
    expect(updateCalls.length).toBeGreaterThan(0)
  })

  it('correct code -> valid:true, code row deleted', async () => {
    const { db, mockPrepare } = createMockDB({
      firstResults: [{ id: 42, code: '123456', attempts: 0 }],
    })
    const result = await verifyCode(db, 'hash123', '123456')
    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
    // Check DELETE was called
    const deleteCalls = mockPrepare.mock.calls.filter(
      (c: string[]) => typeof c[0] === 'string' && c[0].includes('DELETE')
    )
    expect(deleteCalls.length).toBeGreaterThan(0)
  })
})

// ── saveVerificationCode ──────────────────────────────

describe('saveVerificationCode', () => {
  it('inserts row with phone_hash, code, expires_at', async () => {
    const { db, mockPrepare, mockBind } = createMockDB()
    await saveVerificationCode(db, 'hash-abc', '654321')

    // First prepare call should be the INSERT
    const insertCall = mockPrepare.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && c[0].includes('INSERT')
    )
    expect(insertCall).toBeDefined()

    // Bind should have been called with phoneHash and code
    expect(mockBind).toHaveBeenCalledWith('hash-abc', '654321', expect.any(String))
  })

  it('fires cleanup of expired codes', async () => {
    const { db, mockPrepare } = createMockDB()
    await saveVerificationCode(db, 'hash-abc', '654321')

    // Second prepare call should be the DELETE for expired codes
    const deleteCalls = mockPrepare.mock.calls.filter(
      (c: string[]) => typeof c[0] === 'string' && c[0].includes('DELETE')
    )
    expect(deleteCalls.length).toBeGreaterThan(0)
  })
})

// ── checkSendRateLimit (additional coverage) ─────────

describe('checkSendRateLimit', () => {
  it('60s cooldown enforced', async () => {
    const { db, mockFirst } = createMockDB()
    mockFirst
      .mockReset()
      .mockResolvedValueOnce({ cnt: 1 }) // 60s内已有

    const result = await checkSendRateLimit(db, 'hash123')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('60秒')
  })

  it('daily 10-limit enforced', async () => {
    const { db, mockFirst } = createMockDB()
    mockFirst
      .mockReset()
      .mockResolvedValueOnce({ cnt: 0 }) // 60s OK
      .mockResolvedValueOnce({ cnt: 10 }) // daily limit hit

    const result = await checkSendRateLimit(db, 'hash123')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('上限')
  })
})
