import { describe, expect, it } from 'vitest'
import { collectThinkBudSse, createThinkBudSse, guardAiOutput } from '../_shared/output-guard'

describe('output guard', () => {
  it('blocks a direct answer before it reaches the client', () => {
    const result = guardAiOutput('答案是7。', 'lower')
    expect(result.blocked).toBe(true)
    expect(result.content).not.toContain('7')
    expect(result.blockingIssues).toContain('可能泄露了答案')
  })

  it('blocks full worked steps', () => {
    expect(guardAiOutput('第一步减6，第二步除3。', 'upper').blocked).toBe(true)
  })

  it('blocks a bare numeric answer', () => {
    expect(guardAiOutput('7。', 'lower').blocked).toBe(true)
  })

  it('allows a concise Socratic question', () => {
    const result = guardAiOutput('先看左边的+6。怎样让左边更简单？', 'upper')
    expect(result.blocked).toBe(false)
    expect(result.content).toContain('怎样')
  })

  it('round-trips the internal SSE format', async () => {
    expect(await collectThinkBudSse(createThinkBudSse('先看哪个数？'))).toBe('先看哪个数？')
  })
})
