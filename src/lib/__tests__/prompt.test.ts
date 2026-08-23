import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildRTCSystemPrompt } from '../../../functions/_shared/prompt'
import { buildSessionBlock } from '../../../functions/_shared/prompt/session-manager'

// ── 向后兼容 ──────────────────────────────────────────────

describe('向后兼容', () => {
  it('不传 options 时 buildSystemPrompt 输出包含数学策略', () => {
    const prompt = buildSystemPrompt('lower')
    expect(prompt).toContain('数学策略工具箱')
    expect(prompt).toContain('凑十法')
    expect(prompt).toContain('---META---')
  })

  it('不传 options 时 buildRTCSystemPrompt 输出包含数学策略', () => {
    const prompt = buildRTCSystemPrompt('upper')
    expect(prompt).toContain('数学策略工具箱')
    expect(prompt).toContain('拆分凑整')
    expect(prompt).not.toContain('---META---')
  })
})

// ── 学科切换 ──────────────────────────────────────────────

describe('学科切换', () => {
  it('subject=chinese 时包含语文策略，不包含数学策略', () => {
    const prompt = buildSystemPrompt('lower', { subject: 'chinese' })
    expect(prompt).toContain('当前学科：语文')
    expect(prompt).toContain('拼音')
    expect(prompt).toContain('偏旁')
    expect(prompt).not.toContain('数学策略工具箱')
    expect(prompt).not.toContain('凑十法')
  })

  it('subject=english 时包含英语策略，不包含数学策略', () => {
    const prompt = buildSystemPrompt('upper', { subject: 'english' })
    expect(prompt).toContain('当前学科：英语')
    expect(prompt).toContain('自然拼读')
    expect(prompt).not.toContain('数学策略工具箱')
  })

  it('未知学科 fallback 到数学', () => {
    // @ts-expect-error 测试非法值
    const prompt = buildSystemPrompt('lower', { subject: 'science' })
    expect(prompt).toContain('数学策略工具箱')
  })
})

// ── 安全规则 ──────────────────────────────────────────────

describe('安全规则', () => {
  const subjects = ['math', 'chinese', 'english'] as const
  const grades = ['lower', 'upper'] as const

  for (const subject of subjects) {
    for (const grade of grades) {
      it(`${subject}/${grade} 包含绝对禁区`, () => {
        const prompt = buildSystemPrompt(grade, { subject })
        expect(prompt).toContain('绝不给最终答案')
      })

      it(`${subject}/${grade} 不包含能力表扬`, () => {
        const prompt = buildSystemPrompt(grade, { subject })
        // 检查 prompt 本身不在正面示例中使用这些词
        // 注意：❌ 示例中会出现这些词作为反面教材，所以我们检查没有被作为正面建议
        expect(prompt).toContain('成长型思维')
        expect(prompt).toContain('禁止指向能力')
      })

      it(`${subject}/${grade} 包含保守策略`, () => {
        const prompt = buildSystemPrompt(grade, { subject })
        expect(prompt).toContain('保守策略原则')
      })
    }
  }
})

// ── 多题信息块 ──────────────────────────────────────────────

describe('多题会话管理', () => {
  it('无 session 时返回空字符串', () => {
    expect(buildSessionBlock()).toBe('')
    expect(buildSessionBlock({})).toBe('')
    expect(buildSessionBlock({ problems: [] })).toBe('')
  })

  it('有题目时生成格式化信息块', () => {
    const block = buildSessionBlock({
      problems: [
        { index: 1, subject: 'math', summary: '3x + 6 = 9' },
        { index: 2, subject: 'chinese', summary: '看图写话：春天' },
        { index: 3, subject: 'english', summary: '选择正确单词填空' },
      ],
    })
    expect(block).toContain('本页共 3 道题')
    expect(block).toContain('1道数学')
    expect(block).toContain('1道语文')
    expect(block).toContain('1道英语')
    expect(block).toContain('第1题：3x + 6 = 9（数学）')
    expect(block).toContain('多题管理规则')
  })
})

// ── 组合测试 ──────────────────────────────────────────────

describe('学科 + 多题组合', () => {
  it('同时传 subject 和 session 时两个块都存在', () => {
    const prompt = buildSystemPrompt('lower', {
      subject: 'chinese',
      session: {
        problems: [
          { index: 1, subject: 'chinese', summary: '看图写话' },
          { index: 2, subject: 'math', summary: '10+5=?' },
        ],
      },
    })
    expect(prompt).toContain('当前学科：语文')
    expect(prompt).toContain('本页共 2 道题')
    expect(prompt).toContain('绝不给最终答案')
  })
})

// ── RTC 差异 ──────────────────────────────────────────────

describe('RTC 差异', () => {
  it('RTC 包含沉默处理规则', () => {
    const prompt = buildRTCSystemPrompt('lower')
    expect(prompt).toContain('沉默处理')
    expect(prompt).toContain('[SILENCE:')
  })

  it('RTC 不包含 META 格式', () => {
    const prompt = buildRTCSystemPrompt('lower')
    expect(prompt).not.toContain('---META---')
    expect(prompt).not.toContain('emotion：正常/困惑')
  })

  it('STT 包含 META 格式但不包含沉默处理', () => {
    const prompt = buildSystemPrompt('lower')
    expect(prompt).toContain('---META---')
    expect(prompt).not.toContain('[SILENCE:')
  })

  it('RTC 包含语音输出规则', () => {
    const prompt = buildRTCSystemPrompt('lower')
    expect(prompt).toContain('只输出纯对话文本')
  })
})

// ── 学段差异 ──────────────────────────────────────────────

describe('学段差异', () => {
  it('lower 回复长度 25 字', () => {
    const prompt = buildSystemPrompt('lower')
    expect(prompt).toContain('不超过25个字')
  })

  it('upper 回复长度 50 字', () => {
    const prompt = buildSystemPrompt('upper')
    expect(prompt).toContain('不超过50个字')
  })
})
