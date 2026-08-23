// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChat, parseMetaFromContent, trimToContextWindow } from '../useChat'

// ── Mock 外部依赖 ──────────────────────────────────────────

vi.mock('../../lib/api', () => ({
  fetchWithTimeout: vi.fn(),
}))

vi.mock('../../lib/auditAi', () => ({
  auditAiResponse: vi.fn(() => ({ isCompliant: true, issues: [] })),
}))

// Mock crypto.randomUUID — 每次调用返回不同 ID
let uuidCounter = 0
const mockUUID = vi.fn(() => `test-uuid-${++uuidCounter}`)
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: mockUUID },
  writable: true,
})

import { fetchWithTimeout } from '../../lib/api'
import { auditAiResponse } from '../../lib/auditAi'

const mockFetch = vi.mocked(fetchWithTimeout)
const mockAudit = vi.mocked(auditAiResponse)

// ── 辅助：构造 SSE 流 ──────────────────────────────────────

function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

function sseData(d: string): string {
  return `data: ${JSON.stringify({ d })}\n\n`
}

// ── 测试 ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  uuidCounter = 0
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useChat', () => {
  describe('初始状态', () => {
    it('初始 messages 为空，isStreaming 为 false', () => {
      const { result } = renderHook(() => useChat('lower'))
      expect(result.current.messages).toEqual([])
      expect(result.current.isStreaming).toBe(false)
      expect(result.current.error).toBeNull()
    })
  })

  describe('sendMessage', () => {
    it('发送消息后添加 user 和 assistant 消息', async () => {
      const stream = createSSEStream([
        sseData('你好'),
        sseData('呀'),
        'data: [DONE]\n\n',
      ])

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
        text: async () => '',
      } as unknown as Response)

      const { result } = renderHook(() => useChat('lower'))

      await act(async () => {
        await result.current.sendMessage('你好')
      })

      expect(result.current.messages).toHaveLength(2)
      expect(result.current.messages[0].role).toBe('user')
      expect(result.current.messages[0].content).toBe('你好')
      expect(result.current.messages[1].role).toBe('assistant')
      expect(result.current.messages[1].content).toBe('你好呀')
    })

    it('streaming 结束后 isStreaming 恢复 false', async () => {
      const stream = createSSEStream([sseData('回复'), 'data: [DONE]\n\n'])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
        text: async () => '',
      } as unknown as Response)

      const { result } = renderHook(() => useChat('lower'))

      await act(async () => {
        await result.current.sendMessage('测试')
      })

      expect(result.current.isStreaming).toBe(false)
    })

    it('请求失败时设置 error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => '服务器错误',
      } as unknown as Response)

      const { result } = renderHook(() => useChat('lower'))

      await act(async () => {
        await result.current.sendMessage('测试')
      })

      expect(result.current.error).toBeTruthy()
    })

    it('无 body 时抛出错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
        text: async () => '',
      } as unknown as Response)

      const { result } = renderHook(() => useChat('lower'))

      await act(async () => {
        await result.current.sendMessage('测试')
      })

      expect(result.current.error).toBeTruthy()
    })
  })

  describe('META 标签解析', () => {
    it('解析 ---META--- JSON 并设置 emotion 和 thinkingNode', async () => {
      const stream = createSSEStream([
        sseData('很好的思路'),
        sseData('---META---'),
        sseData('{"emotion":"困惑","thinking_node":"理解题意"}'),
        'data: [DONE]\n\n',
      ])

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
        text: async () => '',
      } as unknown as Response)

      const { result } = renderHook(() => useChat('lower'))

      await act(async () => {
        await result.current.sendMessage('我不太懂')
      })

      const assistantMsg = result.current.messages[1]
      expect(assistantMsg.content).toBe('很好的思路')
      expect(assistantMsg.emotion).toBe('困惑')
      expect(assistantMsg.thinkingNode).toBe('理解题意')
    })

    it('META 解析失败时仍保留干净内容', async () => {
      const stream = createSSEStream([
        sseData('引导内容'),
        sseData('---META---'),
        sseData('{broken json'),
        'data: [DONE]\n\n',
      ])

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
        text: async () => '',
      } as unknown as Response)

      const { result } = renderHook(() => useChat('lower'))

      await act(async () => {
        await result.current.sendMessage('测试')
      })

      expect(result.current.messages[1].content).toBe('引导内容')
    })

    it('容错：DeepSeek 残缺 META 分隔符', async () => {
      const stream = createSSEStream([
        sseData('回复内容'),
        sseData('META'),
        sseData('{"emotion":"正常","thinking_node":"解题"}'),
        'data: [DONE]\n\n',
      ])

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
        text: async () => '',
      } as unknown as Response)

      const { result } = renderHook(() => useChat('lower'))

      await act(async () => {
        await result.current.sendMessage('测试')
      })

      expect(result.current.messages[1].content).toBe('回复内容')
    })
  })

  describe('合规审计', () => {
    it('审计不合规时设置 complianceIssues', async () => {
      mockAudit.mockReturnValueOnce({
        isCompliant: false,
        issues: ['可能泄露了答案'],
      })

      const stream = createSSEStream([sseData('等于23'), 'data: [DONE]\n\n'])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
        text: async () => '',
      } as unknown as Response)

      const { result } = renderHook(() => useChat('lower'))

      await act(async () => {
        await result.current.sendMessage('测试')
      })

      expect(result.current.messages[1].complianceIssues).toEqual(['可能泄露了答案'])
    })
  })

  describe('上下文窗口截断', () => {
    it('超过 20 条消息时截断并插入省略标记', async () => {
      const stream = createSSEStream([sseData('ok'), 'data: [DONE]\n\n'])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
        text: async () => '',
      } as unknown as Response)

      const { result } = renderHook(() => useChat('lower'))

      // 预填 22 条消息
      const existingMessages = Array.from({ length: 22 }, (_, i) => ({
        id: `msg-${i}`,
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `消息${i}`,
        timestamp: Date.now(),
      }))

      await act(async () => {
        await result.current.sendMessage('新消息', existingMessages)
      })

      // 验证 fetchWithTimeout 收到的 messages 含省略标记
      const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
      const contents = callBody.messages.map((m: { content: string }) => m.content)
      expect(contents).toContain('[...前面的对话已省略，请根据最近的对话继续引导...]')
      // 总数 = head(2) + gap(1) + tail(18) = 21
      expect(callBody.messages.length).toBe(21)
    })
  })

  describe('addMessage', () => {
    it('直接添加消息到列表', () => {
      const { result } = renderHook(() => useChat('lower'))

      act(() => {
        result.current.addMessage({
          id: 'test',
          role: 'user',
          content: 'OCR识别文本',
          timestamp: Date.now(),
        })
      })

      expect(result.current.messages).toHaveLength(1)
      expect(result.current.messages[0].content).toBe('OCR识别文本')
    })
  })

  describe('stopStreaming', () => {
    it('调用 stopStreaming 不抛异常', () => {
      const { result } = renderHook(() => useChat('lower'))
      expect(() => result.current.stopStreaming()).not.toThrow()
    })
  })
})

// ── parseMetaFromContent 直接单元测试 ──────────────────────────

describe('parseMetaFromContent', () => {
  it('标准 META 块：提取 emotion 和 thinking_node', () => {
    const input = '你想想看\n---META---\n{"emotion":"正常","thinking_node":"理解题意"}'
    const result = parseMetaFromContent(input)
    expect(result.cleanContent).toBe('你想想看')
    expect(result.meta).not.toBeNull()
    expect(result.meta!.emotion).toBe('正常')
    expect(result.meta!.thinking_node).toBe('理解题意')
  })

  it('提取 session_phase 字段', () => {
    const input = '好的，下次见\n---META---\n{"emotion":"正常","thinking_node":"总结","session_phase":"session_complete"}'
    const result = parseMetaFromContent(input)
    expect(result.cleanContent).toBe('好的，下次见')
    expect(result.meta!.session_phase).toBe('session_complete')
  })

  it('容错残缺分隔符：--META-- 格式', () => {
    const input = '内容\n--META--\n{"emotion":"困惑","thinking_node":"分析"}'
    const result = parseMetaFromContent(input)
    expect(result.cleanContent).toBe('内容')
    expect(result.meta).not.toBeNull()
    expect(result.meta!.emotion).toBe('困惑')
  })

  it('兜底裸 JSON：末尾残留 {"emotion...} 时清除并返回 meta=null', () => {
    const input = '回答\n{"emotion":"兴奋"}'
    const result = parseMetaFromContent(input)
    expect(result.cleanContent).toBe('回答')
    expect(result.meta).toBeNull()
  })

  it('无 META：纯文本原样返回', () => {
    const input = '纯文本回复'
    const result = parseMetaFromContent(input)
    expect(result.cleanContent).toBe('纯文本回复')
    expect(result.meta).toBeNull()
  })

  it('META 分隔符后 JSON 无效：返回干净内容和 meta=null', () => {
    const input = '引导内容\n---META---\n{这不是合法JSON'
    const result = parseMetaFromContent(input)
    expect(result.cleanContent).toBe('引导内容')
    expect(result.meta).toBeNull()
  })
})

// ── trimToContextWindow 直接单元测试 ──────────────────────────

describe('trimToContextWindow', () => {
  it('消息数 <= 20 时原样返回', () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `消息${i}`,
    }))
    const result = trimToContextWindow(messages)
    expect(result).toEqual(messages)
    expect(result.length).toBe(15)
  })

  it('消息数 25 时截断为 head(2) + gap(1) + tail(18) = 21', () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `消息${i}`,
    }))
    const result = trimToContextWindow(messages)
    expect(result.length).toBe(21)
    // 前两条保留
    expect(result[0].content).toBe('消息0')
    expect(result[1].content).toBe('消息1')
    // 最后一条是原始最后一条
    expect(result[result.length - 1].content).toBe('消息24')
  })

  it('省略标记的 role 和 content 正确', () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `消息${i}`,
    }))
    const result = trimToContextWindow(messages)
    const gapMarker = result[2] // head 之后的第一条
    expect(gapMarker.role).toBe('user')
    expect(gapMarker.content).toContain('前面的对话已省略')
  })
})
