import { describe, it, expect } from 'vitest'
import { computeAssessment } from '../../../functions/_shared/assessment-engine'

describe('Assessment Engine', () => {
  describe('computeAssessment', () => {
    it('hint_count=1, message_count=10 => independent', () => {
      const result = computeAssessment({
        hint_count: 1,
        message_count: 10,
        resolution_type: 'guided',
        duration_seconds: 300,
        struggle_duration_ms: null,
      })
      expect(result.independenceLevel).toBe('independent')
    })

    it('hint_count=4, message_count=10 => guided', () => {
      const result = computeAssessment({
        hint_count: 4,
        message_count: 10,
        resolution_type: 'guided',
        duration_seconds: 300,
        struggle_duration_ms: null,
      })
      expect(result.independenceLevel).toBe('guided')
    })

    it('hint_count=8, message_count=15 => heavily_guided', () => {
      const result = computeAssessment({
        hint_count: 8,
        message_count: 15,
        resolution_type: 'guided',
        duration_seconds: 600,
        struggle_duration_ms: 120000,
      })
      expect(result.independenceLevel).toBe('heavily_guided')
    })

    it('hint_count=12, message_count=20 => struggling', () => {
      const result = computeAssessment({
        hint_count: 12,
        message_count: 20,
        resolution_type: 'guided',
        duration_seconds: 900,
        struggle_duration_ms: 300000,
      })
      expect(result.independenceLevel).toBe('struggling')
    })

    it('resolution_type=unresolved with any hint_count => struggling', () => {
      const result = computeAssessment({
        hint_count: 1,
        message_count: 10,
        resolution_type: 'unresolved',
        duration_seconds: 300,
        struggle_duration_ms: null,
      })
      expect(result.independenceLevel).toBe('struggling')
    })

    it('guidanceEfficiency = hint_count / message_count', () => {
      const result = computeAssessment({
        hint_count: 3,
        message_count: 12,
        resolution_type: 'guided',
        duration_seconds: 300,
        struggle_duration_ms: null,
      })
      expect(result.guidanceEfficiency).toBe(3 / 12)
    })

    it('null hint_count treated as 0', () => {
      const result = computeAssessment({
        hint_count: null,
        message_count: 10,
        resolution_type: 'guided',
        duration_seconds: 300,
        struggle_duration_ms: null,
      })
      expect(result.independenceLevel).toBe('independent')
      expect(result.hintCount).toBe(0)
      expect(result.guidanceEfficiency).toBe(0)
    })

    it('passes through duration, resolution, struggle fields', () => {
      const result = computeAssessment({
        hint_count: 2,
        message_count: 8,
        resolution_type: 'independent',
        duration_seconds: 450,
        struggle_duration_ms: 60000,
      })
      expect(result.durationSeconds).toBe(450)
      expect(result.resolutionType).toBe('independent')
      expect(result.struggleDurationMs).toBe(60000)
      expect(result.messageCount).toBe(8)
      expect(result.hintCount).toBe(2)
    })
  })
})
