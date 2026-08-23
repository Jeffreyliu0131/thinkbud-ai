import { describe, it, expect } from 'vitest'
import { KC_VOCABULARY } from '../lib/kcVocabulary'

describe('KC_VOCABULARY', () => {
  it('所有 concept 都是唯一的', () => {
    const concepts = KC_VOCABULARY.map(e => e.concept)
    const unique = new Set(concepts)
    expect(unique.size).toBe(concepts.length)
  })

  it('所有条目都有必填字段', () => {
    for (const entry of KC_VOCABULARY) {
      expect(entry.concept).toBeTruthy()
      expect(entry.label).toBeTruthy()
      expect(['math', 'chinese', 'english']).toContain(entry.subject)
      expect(['lower', 'upper', 'both']).toContain(entry.gradeHint)
    }
  })

  it('三个学科都有条目', () => {
    const subjects = new Set(KC_VOCABULARY.map(e => e.subject))
    expect(subjects.has('math')).toBe(true)
    expect(subjects.has('chinese')).toBe(true)
    expect(subjects.has('english')).toBe(true)
  })

  it('concept 使用 snake_case 英文', () => {
    for (const entry of KC_VOCABULARY) {
      expect(entry.concept).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it('label 使用中文', () => {
    for (const entry of KC_VOCABULARY) {
      expect(entry.label).toMatch(/[\u4e00-\u9fff]/)
    }
  })
})
