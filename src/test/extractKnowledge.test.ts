import { describe, it, expect } from 'vitest'

// Test the parseExtractionResult logic extracted from the endpoint
// Since the function is not exported, we replicate the parsing logic here
// to verify the algorithm handles LLM output edge cases

interface ExtractedRaw {
  concept: string
  signal: 'mastery' | 'struggle' | 'neutral'
}

function parseExtractionResult(raw: string): ExtractedRaw[] {
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0]) as unknown[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ExtractedRaw => {
      if (!item || typeof item !== 'object') return false
      const obj = item as Record<string, unknown>
      return (
        typeof obj.concept === 'string' &&
        typeof obj.signal === 'string' &&
        ['mastery', 'struggle', 'neutral'].includes(obj.signal)
      )
    })
  } catch {
    return []
  }
}

describe('parseExtractionResult', () => {
  it('解析标准 JSON 数组', () => {
    const raw = '[{"concept":"carrying","signal":"struggle"}]'
    const result = parseExtractionResult(raw)
    expect(result).toHaveLength(1)
    expect(result[0].concept).toBe('carrying')
    expect(result[0].signal).toBe('struggle')
  })

  it('处理 markdown 代码块包裹', () => {
    const raw = '```json\n[{"concept":"make_ten","signal":"mastery"}]\n```'
    const result = parseExtractionResult(raw)
    expect(result).toHaveLength(1)
    expect(result[0].concept).toBe('make_ten')
  })

  it('过滤无效 signal 值', () => {
    const raw = '[{"concept":"a","signal":"mastery"},{"concept":"b","signal":"invalid"}]'
    const result = parseExtractionResult(raw)
    expect(result).toHaveLength(1)
    expect(result[0].concept).toBe('a')
  })

  it('过滤缺少字段的条目', () => {
    const raw = '[{"concept":"a"},{"signal":"mastery"},{"concept":"b","signal":"struggle"}]'
    const result = parseExtractionResult(raw)
    expect(result).toHaveLength(1)
    expect(result[0].concept).toBe('b')
  })

  it('返回空数组当无 JSON 数组', () => {
    expect(parseExtractionResult('没有识别到知识点')).toEqual([])
    expect(parseExtractionResult('')).toEqual([])
  })

  it('返回空数组当 JSON 无效', () => {
    expect(parseExtractionResult('[{invalid json}')).toEqual([])
  })

  it('限制只返回合法 signal 枚举', () => {
    const raw = '[{"concept":"x","signal":"neutral"}]'
    const result = parseExtractionResult(raw)
    expect(result).toHaveLength(1)
    expect(result[0].signal).toBe('neutral')
  })

  it('处理 LLM 多余文本包裹', () => {
    const raw = '以下是分析结果：\n[{"concept":"carrying","signal":"struggle"}]\n希望有帮助！'
    const result = parseExtractionResult(raw)
    expect(result).toHaveLength(1)
  })
})
