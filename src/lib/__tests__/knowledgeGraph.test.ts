import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { KnowledgePointRecord } from '../../types'

// Mock db module before importing knowledgeGraph
vi.mock('../db', () => ({
  getKnowledgePointsByUserAndSubject: vi.fn(),
}))

import { applyTimeDecay, detectTrend, computeConsistency, buildKnowledgeContext } from '../knowledgeGraph'
import { getKnowledgePointsByUserAndSubject } from '../db'

const mockedGetKP = vi.mocked(getKnowledgePointsByUserAndSubject)

// ── Helper: create a KnowledgePointRecord ────────────────────

function makePoint(overrides: Partial<KnowledgePointRecord> = {}): KnowledgePointRecord {
  return {
    key: 'user1:math:carrying',
    userId: 'user1',
    concept: 'carrying',
    subject: 'math',
    label: '进位加法',
    confidence: 0.4,
    encounters: 5,
    masterySignals: 1,
    struggleSignals: 3,
    lastSeen: Date.now(),
    createdAt: Date.now() - 86400000 * 30,
    ...overrides,
  }
}

// ── 1. applyTimeDecay ────────────────────────────────────────

describe('applyTimeDecay', () => {
  it('returns confidence unchanged for just-seen points', () => {
    const now = Date.now()
    expect(applyTimeDecay(1.0, now, now)).toBeCloseTo(1.0, 2)
  })

  it('returns ~0.5 after 70 days (half-life)', () => {
    const now = Date.now()
    const seventyDaysAgo = now - 70 * 24 * 60 * 60 * 1000
    const result = applyTimeDecay(1.0, seventyDaysAgo, now)
    expect(result).toBeCloseTo(0.497, 1) // exp(-0.01 * 70) ≈ 0.4966
  })

  it('returns ~0.2 after 140 days (double half-life) with confidence 0.8', () => {
    const now = Date.now()
    const days140Ago = now - 140 * 24 * 60 * 60 * 1000
    const result = applyTimeDecay(0.8, days140Ago, now)
    // 0.8 * exp(-0.01 * 140) = 0.8 * 0.2466 ≈ 0.197
    expect(result).toBeCloseTo(0.197, 1)
  })

  it('never returns negative values', () => {
    const now = Date.now()
    const veryOld = now - 1000 * 24 * 60 * 60 * 1000 // 1000 days ago
    const result = applyTimeDecay(0.5, veryOld, now)
    expect(result).toBeGreaterThanOrEqual(0)
  })
})

// ── 2. detectTrend ───────────────────────────────────────────

describe('detectTrend', () => {
  it('returns "进步中" when mastery dominant (3/3)', () => {
    const p = makePoint({ masterySignals: 3, struggleSignals: 0, encounters: 3 })
    expect(detectTrend(p)).toBe('进步中')
  })

  it('returns "退步中" when struggle dominant (3/3)', () => {
    const p = makePoint({ masterySignals: 0, struggleSignals: 3, encounters: 3 })
    expect(detectTrend(p)).toBe('退步中')
  })

  it('returns "稳定" when mixed signals', () => {
    const p = makePoint({ masterySignals: 1, struggleSignals: 1, encounters: 3 })
    expect(detectTrend(p)).toBe('稳定')
  })
})

// ── 3. computeConsistency ────────────────────────────────────

describe('computeConsistency', () => {
  it('returns "稳定掌握" when mastery ratio > 0.7', () => {
    const p = makePoint({ masterySignals: 8, encounters: 10 })
    expect(computeConsistency(p)).toBe('稳定掌握')
  })

  it('returns "持续困难" when mastery ratio < 0.3', () => {
    const p = makePoint({ masterySignals: 2, encounters: 10 })
    expect(computeConsistency(p)).toBe('持续困难')
  })

  it('returns "波动中" when mastery ratio is mid-range', () => {
    const p = makePoint({ masterySignals: 5, encounters: 10 })
    expect(computeConsistency(p)).toBe('波动中')
  })

  it('returns "波动中" when encounters is 0 (safe division)', () => {
    const p = makePoint({ masterySignals: 0, encounters: 0 })
    expect(computeConsistency(p)).toBe('波动中')
  })
})

// ── 4. Enhanced buildKnowledgeContext output ──────────────────

describe('buildKnowledgeContext (enhanced)', () => {
  beforeEach(() => {
    mockedGetKP.mockReset()
  })

  it('returns empty string when no points exist', async () => {
    mockedGetKP.mockResolvedValue([])
    const result = await buildKnowledgeContext('math', 'user1')
    expect(result).toBe('')
  })

  it('includes trend label for struggle concepts', async () => {
    mockedGetKP.mockResolvedValue([
      makePoint({
        confidence: 0.3,
        encounters: 4,
        masterySignals: 0,
        struggleSignals: 4,
        label: '退位减法',
      }),
    ])
    const result = await buildKnowledgeContext('math', 'user1')
    expect(result).toContain('退步中')
    expect(result).toContain('退位减法')
  })

  it('includes consistency label for struggle concepts', async () => {
    mockedGetKP.mockResolvedValue([
      makePoint({
        confidence: 0.2,
        encounters: 5,
        masterySignals: 1,
        struggleSignals: 4,
        label: '进位加法',
      }),
    ])
    const result = await buildKnowledgeContext('math', 'user1')
    expect(result).toContain('持续困难')
  })

  it('respects MAX_CONTEXT_CHARS = 1000', async () => {
    // Create many points to trigger truncation
    const points: KnowledgePointRecord[] = Array.from({ length: 30 }, (_, i) =>
      makePoint({
        key: `user1:math:concept${i}`,
        concept: `concept${i}`,
        label: `非常长的知识点名称第${i}个`,
        confidence: 0.1,
        encounters: 5,
        masterySignals: 0,
        struggleSignals: 5,
      })
    )
    mockedGetKP.mockResolvedValue(points)
    const result = await buildKnowledgeContext('math', 'user1')
    expect(result.length).toBeLessThanOrEqual(1000)
  })

  it('includes dormant concepts section', async () => {
    const now = Date.now()
    mockedGetKP.mockResolvedValue([
      makePoint({
        confidence: 0.9,  // High stored confidence
        encounters: 5,
        masterySignals: 4,
        struggleSignals: 0,
        label: '两位数加法',
        lastSeen: now - 200 * 24 * 60 * 60 * 1000, // 200 days ago -> decay will drop effective well below 0.5
      }),
    ])
    const result = await buildKnowledgeContext('math', 'user1')
    expect(result).toContain('较久未练习')
    expect(result).toContain('两位数加法')
  })

  it('uses time-decayed confidence for classification', async () => {
    const now = Date.now()
    // High stored confidence but very old -> effective should be low
    mockedGetKP.mockResolvedValue([
      makePoint({
        confidence: 0.9,
        encounters: 5,
        masterySignals: 4,
        struggleSignals: 1,
        label: '很久没练的知识点',
        lastSeen: now - 300 * 24 * 60 * 60 * 1000, // 300 days ago
      }),
    ])
    const result = await buildKnowledgeContext('math', 'user1')
    // With 300 days decay: 0.9 * exp(-0.01*300) = 0.9 * 0.0498 ≈ 0.045
    // This should NOT appear as strength despite stored confidence of 0.9
    expect(result).not.toContain('已有基础')
  })
})
