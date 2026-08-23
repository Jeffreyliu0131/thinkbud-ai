import type { Subject, KnowledgePointRecord } from '../types'
import { getKnowledgePointsByUserAndSubject } from './db'

/**
 * Hard cap: 1000 chars ≈ 500 tokens for CJK text (1 CJK char ≈ 2 tokens)
 * Bumped from 600 to 1000 (AI-03) to allow richer knowledge context injection
 * with trend, consistency, and dormant-concept annotations.
 */
const MAX_CONTEXT_CHARS = 1000

/**
 * Minimum encounters before a concept is eligible for display.
 * Avoids mastery/struggle classification from single-session noise (Pitfall 1).
 */
const MIN_ENCOUNTERS_FOR_DISPLAY = 2

/**
 * Confidence threshold to qualify as "mastered" (shown as strength).
 * Only show as strength when encounters >= 3 AND confidence > 0.75 (Pitfall 1).
 */
const MASTERY_THRESHOLD = 0.75
const MASTERY_MIN_ENCOUNTERS = 3

// ── Pure helper functions (exported for testing) ─────────────

/**
 * Time decay: ~70 day half-life, read-time only, never modifies stored value (AI-04).
 * Formula: confidence * exp(-0.01 * days)
 * At 70 days: exp(-0.7) ≈ 0.497, so confidence roughly halves.
 * Exponential decay guarantees non-negative results.
 */
export function applyTimeDecay(confidence: number, lastSeenMs: number, nowMs: number = Date.now()): number {
  const daysSince = (nowMs - lastSeenMs) / (1000 * 60 * 60 * 24)
  return confidence * Math.exp(-0.01 * daysSince)
}

/**
 * Trend detection from signal ratios (AI-03).
 * Since we don't have per-encounter timestamps, we use the overall
 * mastery vs struggle signal ratio as a proxy for recent trend.
 * 2+ mastery of 3 = "进步中", 2+ struggle of 3 = "退步中", else "稳定"
 */
export function detectTrend(p: KnowledgePointRecord): string {
  const masteryRatio = p.encounters > 0 ? p.masterySignals / p.encounters : 0
  const struggleRatio = p.encounters > 0 ? p.struggleSignals / p.encounters : 0

  if (masteryRatio >= 0.67) return '进步中'   // 2+ of 3 are mastery
  if (struggleRatio >= 0.67) return '退步中'  // 2+ of 3 are struggle
  return '稳定'
}

/**
 * Consistency: mastery_signals / encounters ratio (AI-03).
 * >0.7 = stable mastery, <0.3 = persistent difficulty, else fluctuating.
 * Safe for encounters=0 (returns "波动中").
 */
export function computeConsistency(p: KnowledgePointRecord): string {
  if (p.encounters === 0) return '波动中'
  const ratio = p.masterySignals / p.encounters
  if (ratio > 0.7) return '稳定掌握'
  if (ratio < 0.3) return '持续困难'
  return '波动中'
}

// ── Main context builder ─────────────────────────────────────

/**
 * Build a structured knowledge context string for the AI system prompt.
 * Called from useChat.ts and useRTCVoice.ts before each session start.
 *
 * Enhanced with:
 * - Time-decayed effective confidence (read-time only, never modifies stored values)
 * - Trend labels (进步中/退步中/稳定) for struggle concepts
 * - Consistency labels (稳定掌握/持续困难/波动中) for struggle concepts
 * - Dormant concepts section (高stored confidence + 低effective confidence)
 *
 * Returns empty string if no knowledge points exist for this user+subject.
 * Returns a hard-capped Chinese summary string otherwise.
 *
 * Never throws — errors return empty string (caller should treat as "no context").
 */
export async function buildKnowledgeContext(subject: Subject, userId: string): Promise<string> {
  try {
    const points = await getKnowledgePointsByUserAndSubject(userId, subject)
    if (points.length === 0) return ''

    // Apply time decay at read-time (AI-04: never modifies stored values)
    const now = Date.now()
    const withDecay = points.map(p => ({
      ...p,
      effectiveConfidence: applyTimeDecay(p.confidence, p.lastSeen, now),
    }))

    // Struggles: low effective confidence, seen enough times to trust the signal
    const struggles = withDecay
      .filter(p => p.encounters >= MIN_ENCOUNTERS_FOR_DISPLAY && p.effectiveConfidence < 0.5)
      .sort((a, b) => a.effectiveConfidence - b.effectiveConfidence)
      .slice(0, 3)

    // Strengths: high effective confidence with enough encounters
    const strengths = withDecay
      .filter(p => p.encounters >= MASTERY_MIN_ENCOUNTERS && p.effectiveConfidence > MASTERY_THRESHOLD)
      .sort((a, b) => b.effectiveConfidence - a.effectiveConfidence)
      .slice(0, 2)

    // Dormant: high stored confidence but time decay dropped effective below 0.5
    const dormant = withDecay
      .filter(p => p.confidence > 0.6 && p.effectiveConfidence < 0.5 && p.encounters >= MIN_ENCOUNTERS_FOR_DISPLAY)
      .slice(0, 2)

    // If no meaningful signals, skip injection
    if (struggles.length === 0 && strengths.length === 0 && dormant.length === 0) return ''

    const subjectLabel = subject === 'math' ? '数学' : subject === 'chinese' ? '语文' : '英语'
    const lines: string[] = [`## 学生知识状态（${subjectLabel}历史会话）`]

    if (struggles.length > 0) {
      const details = struggles.map(p => {
        const trend = detectTrend(p)
        const consistency = computeConsistency(p)
        return `${p.label}（${trend}，${consistency}）`
      })
      lines.push(`- 需要更多引导：${details.join('、')}`)
    }

    if (strengths.length > 0) {
      const details = strengths.map(p => {
        const trend = detectTrend(p)
        return trend === '稳定' ? p.label : `${p.label}（${trend}）`
      })
      lines.push(`- 已有基础：${details.join('、')}`)
    }

    if (dormant.length > 0) {
      lines.push(`- 较久未练习：${dormant.map(p => p.label).join('、')}`)
    }

    lines.push(`- 遇到以上薄弱点时，请用更小的步骤引导`)

    const result = lines.join('\n')

    // Hard cap at MAX_CONTEXT_CHARS (AI-02: token budget enforcement)
    return result.length > MAX_CONTEXT_CHARS ? result.slice(0, MAX_CONTEXT_CHARS) : result
  } catch (err) {
    console.warn('[knowledgeGraph] buildKnowledgeContext 失败，跳过注入:', err)
    return ''
  }
}
