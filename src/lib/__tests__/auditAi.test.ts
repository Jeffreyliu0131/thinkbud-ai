import { describe, it, expect } from 'vitest'
import { auditAiResponse } from '../auditAi'

// ── 辅助函数 ──────────────────────────────────────────────

function expectCompliant(content: string) {
  const result = auditAiResponse(content)
  expect(result.isCompliant, `应合规但检出问题: ${result.issues.join(', ')} | 内容: "${content}"`).toBe(true)
  expect(result.issues).toHaveLength(0)
}

function expectIssue(content: string, keyword: string) {
  const result = auditAiResponse(content)
  expect(result.isCompliant, `应检出问题"${keyword}"但判为合规 | 内容: "${content}"`).toBe(false)
  expect(result.issues.some(i => i.includes(keyword)), `issues 中应包含"${keyword}"，实际: ${result.issues.join(', ')}`).toBe(true)
}

// ── 1. 直接给答案检测 ──────────────────────────────────────

describe('直接给答案检测', () => {
  it('检测 "等于23"', () => {
    expectIssue('这道题等于23', '泄露了答案')
  })

  it('检测 "= 23"', () => {
    expectIssue('所以答案 = 23', '泄露了答案')
  })

  it('检测全角等号 "＝23"', () => {
    expectIssue('结果＝23', '泄露了答案')
  })

  it('检测 "答案是23"', () => {
    expectIssue('这道题答案是23', '泄露了答案')
  })

  it('检测 "结果是23"', () => {
    expectIssue('最终结果是23', '泄露了答案')
  })

  it('检测 "得23"', () => {
    expectIssue('加起来得23', '泄露了答案')
  })

  // 误报排除
  it('"等于多少" 不误报', () => {
    expectCompliant('你觉得等于多少？')
  })

  it('"是多少" 不误报', () => {
    expectCompliant('你算出来是多少？')
  })

  it('"得多少" 不误报', () => {
    expectCompliant('这样算下来得多少？')
  })

  it('"是不是" 引导句不误报答案检测', () => {
    // 注意：这会触发是非题检测，但不应触发答案泄露
    const result = auditAiResponse('是不是等于5？')
    expect(result.issues.some(i => i.includes('泄露了答案'))).toBe(false)
  })

  it('"你觉得" 引导不误报', () => {
    expectCompliant('你觉得等于几？')
  })

  it('"如果...等于" 假设句不误报', () => {
    expectCompliant('如果这个等于5，那下一步呢？')
  })

  it('"假设...等于" 不误报答案泄露（但会触发直接确认检测，因为含 x等于3）', () => {
    // "假设x等于3" 中 "x等于3" 匹配 DIRECT_CONFIRM_PATTERNS，这是预期行为
    const result = auditAiResponse('假设x等于3，你怎么想？')
    expect(result.issues.some(i => i.includes('泄露了答案'))).toBe(false)
  })

  it('"原本是10" 引用原题数字不误报', () => {
    expectCompliant('题目里原本是10个苹果')
  })
})

// ── 2. 直接确认答案检测 ──────────────────────────────────────

describe('直接确认答案检测', () => {
  it('检测 "没错，x就是1"', () => {
    expectIssue('没错，x就是1', '直接确认了答案')
  })

  it('检测 "对，x等于5"', () => {
    expectIssue('对，x等于5', '直接确认了答案')
  })

  it('检测 "正确，答案是8"', () => {
    expectIssue('正确，答案是8', '直接确认了答案')
  })

  it('检测 "x=5" 格式', () => {
    expectIssue('所以x=5', '直接确认了答案')
  })

  it('检测 "X＝3" 全角', () => {
    expectIssue('X＝3', '直接确认了答案')
  })
})

// ── 3. 完整步骤检测 ──────────────────────────────────────

describe('完整步骤检测', () => {
  it('检测 "第一步"', () => {
    expectIssue('第一步把两个数相加', '完整步骤')
  })

  it('检测 "第二步"', () => {
    expectIssue('第二步再除以2', '完整步骤')
  })

  it('检测 "首先...然后...最后"', () => {
    expectIssue('首先算加法，然后算乘法，最后得到结果', '完整步骤')
  })

  it('检测圈号 ①②③', () => {
    expectIssue('①先看题目', '完整步骤')
  })

  it('检测 "步骤一"', () => {
    expectIssue('步骤一是看清楚题目', '完整步骤')
  })
})

// ── 4. 多问题检测 ──────────────────────────────────────

describe('多问题检测', () => {
  it('一个问号合规', () => {
    // 单个问号 + 短句不会触发多问题
    const result = auditAiResponse('你觉得呢？')
    expect(result.issues.some(i => i.includes('个问题'))).toBe(false)
  })

  it('两个问号检测', () => {
    expectIssue('你觉得呢？为什么这样想？', '个问题')
  })

  it('三个问号检测', () => {
    expectIssue('是吗？为什么？你确定？', '个问题')
  })
})

// ── 5. 回复过长检测 ──────────────────────────────────────

describe('回复过长检测', () => {
  it('4句以内合规', () => {
    const content = '你做得很好。再想想这里。看看这个数字。试试换个方法。'
    const result = auditAiResponse(content)
    expect(result.issues.some(i => i.includes('过长'))).toBe(false)
  })

  it('5句以上检出', () => {
    const content = '第一句话。第二句话。第三句话。第四句话。第五句话。'
    expectIssue(content, '过长')
  })
})

// ── 6. 是非题检测 ──────────────────────────────────────

describe('是非题检测', () => {
  it('检测 "是不是？"', () => {
    expectIssue('这个是不是？', '是非题')
  })

  it('检测 "对不对？"', () => {
    expectIssue('你觉得对不对？', '是非题')
  })

  it('检测 "对吗？"', () => {
    expectIssue('这样对吗？', '是非题')
  })

  it('检测 "好不好？"', () => {
    expectIssue('我们这样做好不好？', '是非题')
  })

  it('检测 "可以吗？"', () => {
    expectIssue('这样可以吗？', '是非题')
  })

  it('"是不是" 在句中不误报', () => {
    // "是不是" 后面还有内容，不在句尾
    const result = auditAiResponse('你看看是不是可以用另一种方法？')
    expect(result.issues.some(i => i.includes('是非题'))).toBe(false)
  })
})

// ── 7. 空洞智力表扬检测 ──────────────────────────────────────

describe('空洞智力表扬检测（Dweck 成长型思维）', () => {
  it('检测 "你真聪明"', () => {
    expectIssue('你真聪明', '空洞智力表扬')
  })

  it('检测 "你好厉害"', () => {
    expectIssue('你好厉害', '空洞智力表扬')
  })

  it('检测 "你好棒"', () => {
    expectIssue('你好棒', '空洞智力表扬')
  })

  it('检测 "这道题很简单"', () => {
    expectIssue('这道题很简单', '空洞智力表扬')
  })

  it('检测 "你应该会的"', () => {
    expectIssue('你应该会的', '空洞智力表扬')
  })

  it('检测 "这个很容易"', () => {
    expectIssue('这个很容易', '空洞智力表扬')
  })

  it('过程表扬合规：换方法尝试', () => {
    expectCompliant('你换了个方法试，很棒的尝试！')
  })

  it('过程表扬合规：坚持思考', () => {
    expectCompliant('你一直在认真想，这种坚持很重要！')
  })
})

// ── 8. 正常回复不误报 ──────────────────────────────────────

describe('正常回复不误报', () => {
  it('标准苏格拉底引导', () => {
    expectCompliant('你觉得可以从哪里开始？')
  })

  it('鼓励式引导', () => {
    expectCompliant('没关系，再想想看。')
  })

  it('追问过程', () => {
    expectCompliant('你是怎么算出来的？')
  })

  it('情绪安抚', () => {
    expectCompliant('别着急，慢慢来。')
  })

  it('空字符串合规', () => {
    expectCompliant('')
  })
})

// ── 9. 多模式组合检测 ──────────────────────────────────────

describe('多模式组合', () => {
  it('同时触发答案泄露 + 步骤', () => {
    const result = auditAiResponse('第一步算出等于23，第二步验算')
    expect(result.isCompliant).toBe(false)
    expect(result.issues.length).toBeGreaterThanOrEqual(2)
  })

  it('同时触发空洞表扬 + 多问题', () => {
    const result = auditAiResponse('你真聪明！那这道怎么做？你想用什么方法？')
    expect(result.isCompliant).toBe(false)
    expect(result.issues.some(i => i.includes('空洞智力表扬'))).toBe(true)
    expect(result.issues.some(i => i.includes('个问题'))).toBe(true)
  })
})
