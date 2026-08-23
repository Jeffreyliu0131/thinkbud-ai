import { describe, it, expect } from 'vitest'
import { buildVocabString, KC_VOCABULARY } from '../lib/kcVocabulary'

describe('buildVocabString', () => {
  it('只返回指定学科的条目', () => {
    const mathStr = buildVocabString('math')
    expect(mathStr).toContain('make_ten')
    expect(mathStr).not.toContain('initial_finals') // chinese
    expect(mathStr).not.toContain('phonics') // english
  })

  it('格式为 concept(label) 逗号分隔', () => {
    const str = buildVocabString('math')
    expect(str).toMatch(/\w+\(.+?\)(, \w+\(.+?\))*/)
  })

  it('语文学科有条目', () => {
    const str = buildVocabString('chinese')
    expect(str.length).toBeGreaterThan(0)
    expect(str).toContain('initial_finals')
  })

  it('英语学科有条目', () => {
    const str = buildVocabString('english')
    expect(str.length).toBeGreaterThan(0)
    expect(str).toContain('phonics')
  })

  it('每个学科的条目数量与词汇表匹配', () => {
    const mathCount = KC_VOCABULARY.filter(e => e.subject === 'math').length
    const mathStr = buildVocabString('math')
    const mathCommas = (mathStr.match(/, /g) || []).length
    expect(mathCommas).toBe(mathCount - 1)
  })
})
