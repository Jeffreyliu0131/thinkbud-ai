import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildRTCSystemPrompt } from '../_shared/prompt/index'

// ── buildSystemPrompt frustration rules ──────────────────

describe('buildSystemPrompt frustration detection', () => {
  it('lower grade includes 烦躁 detection', () => {
    const prompt = buildSystemPrompt('lower')
    expect(prompt).toContain('烦躁')
  })

  it('lower grade includes 受挫累积 detection', () => {
    const prompt = buildSystemPrompt('lower')
    expect(prompt).toContain('受挫累积')
  })

  it('upper grade includes 烦躁 detection', () => {
    const prompt = buildSystemPrompt('upper')
    expect(prompt).toContain('烦躁')
  })

  it('upper grade includes 受挫累积 detection', () => {
    const prompt = buildSystemPrompt('upper')
    expect(prompt).toContain('受挫累积')
  })

  it('lower grade includes 温暖具象 comfort style', () => {
    const prompt = buildSystemPrompt('lower')
    expect(prompt).toContain('温暖具象')
  })

  it('upper grade has different comfort style (尊重理性)', () => {
    const prompt = buildSystemPrompt('upper')
    expect(prompt).toContain('尊重理性')
  })

  it('lower and upper have different comfort styles', () => {
    const lower = buildSystemPrompt('lower')
    const upper = buildSystemPrompt('upper')
    // Lower uses 温暖具象, upper uses 尊重理性
    expect(lower).toContain('温暖具象')
    expect(upper).not.toContain('温暖具象')
    expect(upper).toContain('尊重理性')
    expect(lower).not.toContain('尊重理性')
  })
})

// ── buildRTCSystemPrompt frustration rules ──────────────

describe('buildRTCSystemPrompt frustration detection', () => {
  it('lower grade RTC includes 烦躁 detection', () => {
    const prompt = buildRTCSystemPrompt('lower')
    expect(prompt).toContain('烦躁')
  })

  it('lower grade RTC includes 受挫累积 detection', () => {
    const prompt = buildRTCSystemPrompt('lower')
    expect(prompt).toContain('受挫累积')
  })

  it('upper grade RTC includes 烦躁 detection', () => {
    const prompt = buildRTCSystemPrompt('upper')
    expect(prompt).toContain('烦躁')
  })

  it('upper grade RTC includes 受挫累积 detection', () => {
    const prompt = buildRTCSystemPrompt('upper')
    expect(prompt).toContain('受挫累积')
  })

  it('RTC prompt includes frustration comfort for lower', () => {
    const prompt = buildRTCSystemPrompt('lower')
    expect(prompt).toContain('没事，慢慢来')
  })

  it('RTC prompt includes frustration comfort for upper', () => {
    const prompt = buildRTCSystemPrompt('upper')
    expect(prompt).toContain('不着急')
  })
})
