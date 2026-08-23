import { describe, it, expect } from 'vitest'
import { auditAiResponse, auditWhiteboardSteps } from '../../functions/_shared/audit'

describe('auditAiResponse', () => {
  it('通过合规的苏格拉底式回复', () => {
    const result = auditAiResponse('你觉得这道题应该怎么开始想？')
    expect(result.isCompliant).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('检测直接给出计算结果', () => {
    const result = auditAiResponse('这道题等于 42')
    expect(result.isCompliant).toBe(false)
    expect(result.issues).toContain('可能泄露了答案')
  })

  it('排除「等于多少」类引导式问句的误报', () => {
    const result = auditAiResponse('你觉得等于多少？')
    expect(result.isCompliant).toBe(true)
  })

  it('检测直接确认答案', () => {
    const result = auditAiResponse('没错，3 × 5 是 15')
    expect(result.isCompliant).toBe(false)
    expect(result.issues.some(i => i.includes('直接确认了答案'))).toBe(true)
  })

  it('检测完整步骤列举', () => {
    const result = auditAiResponse('第一步先把两个数字对齐')
    expect(result.isCompliant).toBe(false)
    expect(result.issues.some(i => i.includes('完整步骤'))).toBe(true)
  })

  it('检测一次多个问题', () => {
    const result = auditAiResponse('你觉得呢？那如果换一种方法呢？')
    expect(result.isCompliant).toBe(false)
    expect(result.issues.some(i => i.includes('问了2个问题'))).toBe(true)
  })

  it('检测间接暗示答案', () => {
    const result = auditAiResponse('是不是 15？')
    expect(result.isCompliant).toBe(false)
    expect(result.issues.some(i => i.includes('暗示了答案'))).toBe(true)
  })

  it('检测是非题', () => {
    const result = auditAiResponse('是不是？')
    expect(result.isCompliant).toBe(false)
    expect(result.issues.some(i => i.includes('是非题'))).toBe(true)
  })

  it('检测空洞智力表扬', () => {
    const result = auditAiResponse('你真聪明')
    expect(result.isCompliant).toBe(false)
    expect(result.issues.some(i => i.includes('空洞智力表扬'))).toBe(true)
  })

  it('检测回复过长', () => {
    const result = auditAiResponse('第一句话。第二句话。第三句话。第四句话。第五句话。')
    expect(result.isCompliant).toBe(false)
    expect(result.issues.some(i => i.includes('回复过长'))).toBe(true)
  })
})

describe('auditWhiteboardSteps', () => {
  it('通过安全的白板步骤', () => {
    const steps = [
      { id: 1, label: '理解题目', math: '3 + ? = 7' },
      { id: 2, label: '列出条件', hint: '想一想' },
    ]
    const result = auditWhiteboardSteps(steps)
    expect(result.filtered).toHaveLength(2)
    expect(result.issues).toHaveLength(0)
  })

  it('过滤掉 x = number 格式的答案泄露', () => {
    const steps = [
      { id: 1, label: '理解题目', math: '3 + x = 7' },
      { id: 2, label: '求解', math: 'x = 4' },
    ]
    const result = auditWhiteboardSteps(steps)
    expect(result.filtered).toHaveLength(1)
    expect(result.filtered[0].id).toBe(1)
    expect(result.issues).toHaveLength(1)
  })

  it('过滤掉 = number 格式的答案泄露', () => {
    const steps = [
      { id: 1, label: '计算过程' },
      { id: 2, label: '结果', math: '= 15' },
    ]
    const result = auditWhiteboardSteps(steps)
    expect(result.filtered).toHaveLength(1)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('过滤掉以答案关键词开头的 label', () => {
    const steps = [
      { id: 1, label: '第一步', math: '3 + 4' },
      { id: 2, label: '答案是这个' },
    ]
    const result = auditWhiteboardSteps(steps)
    expect(result.filtered).toHaveLength(1)
    expect(result.filtered[0].id).toBe(1)
  })

  it('空步骤数组返回空结果', () => {
    const result = auditWhiteboardSteps([])
    expect(result.filtered).toHaveLength(0)
    expect(result.issues).toHaveLength(0)
  })
})
