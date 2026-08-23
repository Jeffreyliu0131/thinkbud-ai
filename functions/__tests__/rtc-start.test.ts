import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── PagesFunction 全局类型 ──────────────────────────────────

// ── vi.mock() 声明（hoisted） ──────────────────────────────

vi.mock('../_shared/providers/rtc/sign', () => ({
  signRequest: vi.fn().mockResolvedValue({ 'Content-Type': 'application/json' }),
}))

vi.mock('../_shared/rate-limit', () => ({
  checkUserRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))

vi.mock('../_shared/env', () => ({
  getEnvVar: vi.fn((_env: unknown, key: string) => `test-${key}`),
}))

vi.mock('../_shared/prompt', () => ({
  buildRTCSystemPrompt: vi.fn().mockReturnValue('mock system prompt'),
}))

vi.mock('../_shared/usage-time', () => ({
  startUsageSession: vi.fn().mockResolvedValue(undefined),
}))

// ── Mock fetch ──────────────────────────────────────────

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ Result: { TaskId: 'test-task' } }),
})
vi.stubGlobal('fetch', mockFetch)

// ── Import SUT after mocks ─────────────────────────────

import { onRequestPost } from '../api/rtc-start'
import { checkUserRateLimit } from '../_shared/rate-limit'

// ── Mock context helper ─────────────────────────────────

function createMockContext(body: Record<string, unknown>) {
  const waitUntilPromises: Promise<unknown>[] = []
  const mockFirst = vi.fn().mockResolvedValue(null)
  const mockRun = vi.fn().mockResolvedValue({ success: true })
  const mockBind = vi.fn(() => ({ first: mockFirst, run: mockRun }))
  const mockPrepare = vi.fn(() => ({ bind: mockBind, run: mockRun }))
  return {
    ctx: {
      request: new Request('https://app.example.com/api/rtc-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env: {
        DB: { prepare: mockPrepare } as unknown as D1Database,
        JWT_SECRET: 'test',
        RTC_APP_ID: 'test-rtc',
        VOLC_ACCESS_KEY_ID: 'test-ak',
        VOLC_SECRET_ACCESS_KEY: 'test-sk',
        TTS_APP_ID: 'test-tts',
        TTS_ACCESS_TOKEN: 'test-tts-token',
        TTS_VOICE_TYPE: 'test-voice',
        STT_APP_ID: 'test-stt',
        STT_ACCESS_TOKEN: 'test-stt-token',
        ARK_MODEL_ID: 'test-model',
      },
      data: { userId: 'test-user-123' },
      next: vi.fn(),
      waitUntil: vi.fn((p: Promise<unknown>) => waitUntilPromises.push(p)),
    },
    waitUntilPromises,
  }
}

const validBody = {
  roomId: 'room-123',
  userId: 'user-456',
  taskId: 'task-789',
  gradeLevel: 'lower',
}

// ── Tests ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ Result: { TaskId: 'test-task' } }),
  })
  vi.mocked(checkUserRateLimit).mockResolvedValue({ allowed: true })
})

describe('rtc-start endpoint', () => {
  describe('参数校验', () => {
    it('缺少 roomId 返回 400', async () => {
      const { ctx } = createMockContext({ userId: 'u', taskId: 't', gradeLevel: 'lower' })
      const response = await onRequestPost(ctx as never)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('缺少必要参数')
    })

    it('缺少 userId 返回 400', async () => {
      const { ctx } = createMockContext({ roomId: 'r', taskId: 't', gradeLevel: 'lower' })
      const response = await onRequestPost(ctx as never)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('缺少必要参数')
    })

    it('缺少 taskId 返回 400', async () => {
      const { ctx } = createMockContext({ roomId: 'r', userId: 'u', gradeLevel: 'lower' })
      const response = await onRequestPost(ctx as never)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('缺少必要参数')
    })

    it('缺少 gradeLevel 返回 400', async () => {
      const { ctx } = createMockContext({ roomId: 'r', userId: 'u', taskId: 't' })
      const response = await onRequestPost(ctx as never)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('缺少必要参数')
    })

    it('无效 gradeLevel 返回 400', async () => {
      const { ctx } = createMockContext({ ...validBody, gradeLevel: 'invalid' })
      const response = await onRequestPost(ctx as never)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('无效的 gradeLevel 参数')
    })

    it('无效 subject 返回 400', async () => {
      const { ctx } = createMockContext({ ...validBody, subject: 'physics' })
      const response = await onRequestPost(ctx as never)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('无效的 subject 参数')
    })

    it('非字符串 learnerContext 返回 400', async () => {
      const { ctx } = createMockContext({ ...validBody, learnerContext: 12345 })
      const response = await onRequestPost(ctx as never)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('learnerContext 必须是字符串')
    })
  })

  describe('限流', () => {
    it('限流拒绝返回 429', async () => {
      vi.mocked(checkUserRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 })
      const { ctx } = createMockContext(validBody)
      const response = await onRequestPost(ctx as never)
      expect(response.status).toBe(429)
      const body = await response.json()
      expect(body.error).toContain('请求过于频繁')
    })
  })

  describe('火山引擎 API 错误', () => {
    it('API 返回错误时返回 500 包含 StartVoiceChat 失败', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          ResponseMetadata: { Error: { Code: 'InternalError', Message: 'Service unavailable' } },
        }),
      })
      const { ctx } = createMockContext(validBody)
      const response = await onRequestPost(ctx as never)
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toContain('StartVoiceChat 失败')
    })
  })

  describe('成功场景', () => {
    it('有效请求返回 success: true 和 botUserId', async () => {
      const { ctx } = createMockContext(validBody)
      const response = await onRequestPost(ctx as never)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.botUserId).toBe('bot_task-789')
    })

    it('超长 learnerContext 被截断而非拒绝', async () => {
      const longContext = 'a'.repeat(3000)
      const { ctx } = createMockContext({ ...validBody, learnerContext: longContext })
      const response = await onRequestPost(ctx as never)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
    })
  })
})
