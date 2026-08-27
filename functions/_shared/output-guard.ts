import { auditAiResponse } from './audit'
import type { GradeLevel } from './prompt'

export interface OutputGuardResult {
  content: string
  blocked: boolean
  issues: string[]
  blockingIssues: string[]
}

const BLOCKING_ISSUE_MARKERS = [
  '泄露了答案',
  '直接确认了答案',
  '完整步骤',
  '反问形式暗示了答案',
]

const SAFE_FALLBACK: Record<GradeLevel, string> = {
  lower: '我不能替你写答案。先圈出你确定的数，它是几？',
  upper: '我不能替你写答案。先指出你已经确定的条件是什么？',
}

export function guardAiOutput(content: string, gradeLevel: GradeLevel): OutputGuardResult {
  const audit = auditAiResponse(content)
  const blockingIssues = audit.issues.filter(issue =>
    BLOCKING_ISSUE_MARKERS.some(marker => issue.includes(marker))
  )
  if (blockingIssues.length === 0) {
    return { content, blocked: false, issues: audit.issues, blockingIssues: [] }
  }
  return {
    content: SAFE_FALLBACK[gradeLevel],
    blocked: true,
    issues: audit.issues,
    blockingIssues,
  }
}

export async function collectThinkBudSse(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = (buffer + decoder.decode(value, { stream: true })).split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (!data || data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data) as { d?: string }
        if (parsed.d) content += parsed.d
      } catch {
        // Malformed provider frames are ignored and never forwarded.
      }
    }
  }

  if (buffer.startsWith('data: ')) {
    const data = buffer.slice(6).trim()
    if (data && data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data) as { d?: string }
        if (parsed.d) content += parsed.d
      } catch {
        // Ignore incomplete final frame.
      }
    }
  }
  return content
}

export function createThinkBudSse(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ d: content })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}
