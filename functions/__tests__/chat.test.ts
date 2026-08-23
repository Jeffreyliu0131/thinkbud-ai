import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── PagesFunction 全局类型（Cloudflare Workers 全局类型） ──────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PagesFunction<Env = unknown, Params extends string = string, Data extends Record<string, unknown> = Record<string, unknown>> = (
  context: { request: Request; env: Env; data: Data; next: () => Promise<Response>; waitUntil: (p: Promise<unknown>) => void }
) => Promise<Response> | Response
;(globalThis as Record<string, unknown>).PagesFunction = undefined

// ── vi.mock 声明（必须在 import 之前） ──────────────────────

vi.mock('../_shared/providers/chat/ark', () => ({
  chatCompletionStream: vi.fn(),
}))

vi.mock('../_shared/rate-limit', () => ({
  checkUserRateLimit: vi.fn(),
}))

vi.mock('../_shared/db', () => ({
  ensureConversation: vi.fn().mockResolvedValue(undefined),
  addMessage: vi.fn().mockResolvedValue(undefined),
  touchUserActivity: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../_shared/prompt', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('mock system prompt'),
}))

vi.mock('../_shared/usage-time', () => ({
  startUsageSession: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../_shared/audit', () => ({
  auditAiResponse: vi.fn().mockReturnValue({ isCompliant: true, issues: [] }),
}))

vi.mock('../_shared/meta-parser', () => ({
  parseMetaFromContent: vi.fn().mockReturnValue({ cleanContent: 'AI回复内容', meta: null }),
}))

// ── Imports（在 vi.mock 之后） ──────────────────────

import { onRequestPost } from '../api/chat'
import { chatCompletionStream } from '../_shared/providers/chat/ark'
import { checkUserRateLimit } from '../_shared/rate-limit'
import { addMessage } from '../_shared/db'
import { auditAiResponse } from '../_shared/audit'

// ── Mock 工具 ──────────────────────────────────────

function createMockSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ d: chunk })}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

function createMockDB() {
  const mockFirst = vi.fn().mockResolvedValue(null)
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

function createMockContext(body: Record<string, unknown>) {
  const waitUntilPromises: Promise<unknown>[] = []
  const { db } = createMockDB()
  return {
    ctx: {
      request: new Request('https://app.example.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env: { DB: db, JWT_SECRET: 'test' } as Record<string, unknown>,
      data: { userId: 'test-user-123' } as Record<string, unknown>,
      next: vi.fn(),
      waitUntil: vi.fn((p: Promise<unknown>) => { waitUntilPromises.push(p) }),
    },
    waitUntilPromises,
  }
}

const VALID_BODY = {
  messages: [{ role: 'user', content: '1+1等于多少' }],
  gradeLevel: 'lower',
  subject: 'math',
}

// ── 测试 ──────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // 默认 mock 返回值
  vi.mocked(checkUserRateLimit).mockResolvedValue({ allowed: true, remaining: 9 })
  vi.mocked(chatCompletionStream).mockResolvedValue(createMockSSEStream(['你好', '同学']))
})

describe('chat endpoint', () => {
  // ── 参数校验 ──────────────────────────────────────

  describe('参数校验', () => {
    it('缺少 messages 返回 400', async () => {
      const { ctx } = createMockContext({ gradeLevel: 'lower' })

      const response = await onRequestPost(ctx as never)

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string }
      expect(body.error).toContain('参数格式错误')
    })

    it('缺少 gradeLevel 返回 400', async () => {
      const { ctx } = createMockContext({ messages: [{ role: 'user', content: 'hi' }] })

      const response = await onRequestPost(ctx as never)

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string }
      expect(body.error).toContain('参数格式错误')
    })

    it('无效 gradeLevel 返回 400', async () => {
      const { ctx } = createMockContext({
        messages: [{ role: 'user', content: 'hi' }],
        gradeLevel: 'invalid',
      })

      const response = await onRequestPost(ctx as never)

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string }
      expect(body.error).toContain('无效的 gradeLevel 参数')
    })

    it('无效 subject 返回 400', async () => {
      const { ctx } = createMockContext({
        messages: [{ role: 'user', content: 'hi' }],
        gradeLevel: 'lower',
        subject: 'physics',
      })

      const response = await onRequestPost(ctx as never)

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string }
      expect(body.error).toContain('无效的 subject 参数')
    })

    it('非字符串 learnerContext 返回 400', async () => {
      const { ctx } = createMockContext({
        messages: [{ role: 'user', content: 'hi' }],
        gradeLevel: 'lower',
        learnerContext: 123,
      })

      const response = await onRequestPost(ctx as never)

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string }
      expect(body.error).toContain('learnerContext 必须是字符串')
    })
  })

  // ── 限流 ──────────────────────────────────────

  describe('限流', () => {
    it('限流被拒绝返回 429', async () => {
      vi.mocked(checkUserRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
      const { ctx } = createMockContext(VALID_BODY)

      const response = await onRequestPost(ctx as never)

      expect(response.status).toBe(429)
      const body = await response.json() as { error: string }
      expect(body.error).toContain('请求过于频繁')
    })
  })

  // ── SSE 响应格式 ──────────────────────────────────

  describe('SSE 响应格式', () => {
    it('成功请求返回 text/event-stream 和 no-cache', async () => {
      const { ctx } = createMockContext(VALID_BODY)

      const response = await onRequestPost(ctx as never)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
    })

    it('SSE 流包含 mock 数据', async () => {
      const { ctx } = createMockContext(VALID_BODY)

      const response = await onRequestPost(ctx as never)
      const text = await response.text()

      expect(text).toContain('你好')
      expect(text).toContain('同学')
      expect(text).toContain('[DONE]')
    })
  })

  // ── D1 消息持久化 ──────────────────────────────────

  describe('D1 消息持久化', () => {
    it('流消费后 addMessage 被调用写入用户消息', async () => {
      const { ctx, waitUntilPromises } = createMockContext(VALID_BODY)

      const response = await onRequestPost(ctx as never)
      // 消费完整流以触发 flush
      await response.text()
      // 等待所有 waitUntil 异步任务
      await Promise.all(waitUntilPromises)

      // 确认 addMessage 被调用了至少 1 次含 'user' 角色
      const addMessageCalls = vi.mocked(addMessage).mock.calls
      const userMsgCall = addMessageCalls.find(call => call[3] === 'user')
      expect(userMsgCall).toBeTruthy()
    })

    it('流消费后 addMessage 被调用写入 AI 回复', async () => {
      const { ctx, waitUntilPromises } = createMockContext(VALID_BODY)

      const response = await onRequestPost(ctx as never)
      await response.text()
      await Promise.all(waitUntilPromises)

      const addMessageCalls = vi.mocked(addMessage).mock.calls
      const assistantMsgCall = addMessageCalls.find(call => call[3] === 'assistant')
      expect(assistantMsgCall).toBeTruthy()
    })
  })

  // ── 合规审计 ──────────────────────────────────────

  describe('合规审计', () => {
    it('流消费后 auditAiResponse 被调用', async () => {
      const { ctx, waitUntilPromises } = createMockContext(VALID_BODY)

      const response = await onRequestPost(ctx as never)
      await response.text()
      await Promise.all(waitUntilPromises)

      expect(auditAiResponse).toHaveBeenCalled()
    })
  })
})
