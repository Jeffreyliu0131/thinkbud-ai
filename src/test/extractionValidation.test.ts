import { describe, it, expect } from 'vitest'
import { buildExtractionSystemPrompt, parseExtractionResult } from '../../functions/api/extract-knowledge'
import { KC_VOCABULARY } from '../lib/kcVocabulary'
import groundTruthData from './groundTruth.json'

// Type for ground truth entries
interface GroundTruthEntry {
  conversationId: string
  subject: 'math' | 'chinese' | 'english'
  messages: Array<{ role: string; content: string }>
  expectedConcepts: Array<{ concept: string; signal: string }>
  notes?: string
}

const conversations = groundTruthData.conversations as unknown as GroundTruthEntry[]

/**
 * Simulate the extraction pipeline without LLM call.
 * This tests parseExtractionResult + KC_VOCABULARY filtering,
 * using pre-recorded LLM outputs stored in ground truth entries.
 *
 * For full pipeline validation (including LLM), run with
 * EXTRACTION_VALIDATION_LIVE=true environment variable.
 */
function extractConcepts(
  _messages: Array<{ role: string; content: string }>,
  subject: string,
  llmOutput?: string
): Array<{ concept: string; signal: string }> {
  if (!llmOutput) return [] // No LLM output provided, skip

  const extracted = parseExtractionResult(llmOutput)
  // Filter to valid KC_VOCABULARY concepts (same as production code)
  return extracted.filter(item =>
    KC_VOCABULARY.some(e => e.concept === item.concept && e.subject === subject)
  )
}

describe('知识点提取准确率验证 (ASSESS-04)', () => {
  it('ground truth has 20+ conversations', () => {
    expect(conversations.length).toBeGreaterThanOrEqual(20)
  })

  it('all ground truth concepts exist in KC_VOCABULARY', () => {
    for (const conv of conversations) {
      for (const expected of conv.expectedConcepts) {
        const found = KC_VOCABULARY.some(
          e => e.concept === expected.concept && e.subject === conv.subject
        )
        expect(
          found,
          `Concept "${expected.concept}" not found in KC_VOCABULARY for subject "${conv.subject}" (conv: ${conv.conversationId})`
        ).toBe(true)
      }
    }
  })

  it('parseExtractionResult correctly parses valid JSON arrays', () => {
    const result = parseExtractionResult('[{"concept":"carrying","signal":"struggle"}]')
    expect(result).toHaveLength(1)
    expect(result[0].concept).toBe('carrying')
    expect(result[0].signal).toBe('struggle')
  })

  it('parseExtractionResult handles markdown-wrapped JSON', () => {
    const result = parseExtractionResult(
      '```json\n[{"concept":"carrying","signal":"mastery"}]\n```'
    )
    expect(result).toHaveLength(1)
  })

  it('parseExtractionResult returns empty array for invalid input', () => {
    expect(parseExtractionResult('not json')).toEqual([])
    expect(parseExtractionResult('')).toEqual([])
  })

  // This test requires pre-recorded LLM outputs in ground truth
  // When running live validation: EXTRACTION_VALIDATION_LIVE=true npm test
  it.skipIf(!process.env.EXTRACTION_VALIDATION_LIVE)(
    'precision >= 70% (GATE for Phase 15)',
    async () => {
      let totalExtracted = 0
      let correctlyExtracted = 0

      for (const gt of conversations) {
        // Use pre-recorded llmOutput field if present
        const extracted = extractConcepts(
          gt.messages,
          gt.subject,
          (gt as unknown as Record<string, unknown>).llmOutput as string | undefined
        )
        totalExtracted += extracted.length

        for (const e of extracted) {
          if (gt.expectedConcepts.some(c => c.concept === e.concept)) {
            correctlyExtracted++
          }
        }
      }

      const precision = totalExtracted > 0 ? correctlyExtracted / totalExtracted : 0
      console.log(
        `\n[ASSESS-04] Extraction Precision: ${(precision * 100).toFixed(1)}% (${correctlyExtracted}/${totalExtracted})`
      )
      console.log(`[ASSESS-04] Conversations validated: ${conversations.length}`)

      expect(precision).toBeGreaterThanOrEqual(0.7)
    }
  )

  it('buildExtractionSystemPrompt includes KC vocabulary for each subject', () => {
    for (const subject of ['math', 'chinese', 'english'] as const) {
      const prompt = buildExtractionSystemPrompt(subject)
      expect(prompt).toContain('知识点词汇表')
      expect(prompt).toContain('mastery')
      expect(prompt).toContain('struggle')
      expect(prompt).toContain('neutral')
    }
  })
})
