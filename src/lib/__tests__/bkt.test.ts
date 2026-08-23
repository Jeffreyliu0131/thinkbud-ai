import { describe, it, expect } from 'vitest'
import { updateBKT, DEFAULT_BKT_PARAMS } from '../bkt'

describe('BKT Module', () => {
  describe('DEFAULT_BKT_PARAMS', () => {
    it('has pL0=0.5, pT=0.1, pG=0.2, pS=0.1', () => {
      expect(DEFAULT_BKT_PARAMS).toEqual({
        pL0: 0.5,
        pT: 0.1,
        pG: 0.2,
        pS: 0.1,
      })
    })
  })

  describe('updateBKT', () => {
    it('mastery increases confidence from 0.5', () => {
      const result = updateBKT(0.5, true)
      expect(result).toBeGreaterThan(0.5)
    })

    it('struggle decreases confidence from 0.5', () => {
      const result = updateBKT(0.5, false)
      expect(result).toBeLessThan(0.5)
    })

    it('clamps lower bound at 0.05 (prevents stuck at 0)', () => {
      const result = updateBKT(0.01, true)
      expect(result).toBeGreaterThanOrEqual(0.05)
    })

    it('clamps upper bound at 0.95 (prevents stuck at 1)', () => {
      const result = updateBKT(0.99, false)
      expect(result).toBeLessThanOrEqual(0.95)
    })

    it('respects custom params', () => {
      const customParams = { pL0: 0.3, pT: 0.2, pG: 0.3, pS: 0.05 }
      const defaultResult = updateBKT(0.5, true)
      const customResult = updateBKT(0.5, true, customParams)
      expect(customResult).not.toBe(defaultResult)
    })

    it('repeated mastery drives confidence toward upper clamp', () => {
      let confidence = 0.5
      for (let i = 0; i < 20; i++) {
        confidence = updateBKT(confidence, true)
      }
      expect(confidence).toBeLessThanOrEqual(0.95)
      expect(confidence).toBeGreaterThan(0.9)
    })

    it('repeated struggle drives confidence toward lower clamp', () => {
      let confidence = 0.5
      for (let i = 0; i < 20; i++) {
        confidence = updateBKT(confidence, false)
      }
      expect(confidence).toBeGreaterThanOrEqual(0.05)
      expect(confidence).toBeLessThan(0.15)
    })
  })
})
