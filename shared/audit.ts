/**
 * AI 合规审计层 — 单一来源 (shared/)
 * 规范来源: 产品宪法 + 教学研究原则
 *
 * 检测 AI 回复是否违反产品宪法和教学研究原则
 * 前端(src/lib/auditAi.ts)和服务端(functions/_shared/audit.ts)均从此文件导入
 */

export interface AuditResult {
  isCompliant: boolean
  issues: string[]
}

/** 检测直接给出计算结果 */
const ANSWER_PATTERNS = [
  /等于\s*\d+/,
  /[=＝]\s*\d+/,
  /答案是\s*\d+/,
  /结果是\s*\d+/,
  /得\s*\d+/,
  /等于[零一二三四五六七八九十百千万]+/,
]

/** 排除误报的模式 */
const FALSE_POSITIVE_PATTERNS = [
  /等于多少/,
  /是多少/,
  /得多少/,
  /是不是/,
  /对不对/,
  /还是/,
  /你觉得/,
  /你想/,
  /如果.*等于/,
  /假设.*等于/,
  /你是怎么/,
  /你怎么算/,
  /原本是\d+/,
]

/** 检测直接确认答案 */
const DIRECT_CONFIRM_PATTERNS = [
  /没错[，,].*[是等于]\s*\d+/,
  /对[，,].*[是等于]\s*\d+/,
  /正确[，,].*[是等于]\s*\d+/,
  /[x×X]\s*[是就等于=＝]+\s*\d+/,
]

/** 检测完整步骤列举 */
const STEP_PATTERNS = [
  /第[一二三四五六七八九十1-9]步/,
  /首先.*然后.*最后/,
  /[①②③④⑤]/,
  /步骤[一二三1-9]/,
]

/** 检测是非题 */
const YES_NO_PATTERNS = [
  /是不是[？?]?\s*$/,
  /对不对[？?]?\s*$/,
  /对吗[？?]?\s*$/,
  /好不好[？?]?\s*$/,
  /可以吗[？?]?\s*$/,
]

/** 检测间接暗示答案 */
const INDIRECT_HINT_PATTERNS = [
  /是不是\s*\d+[？?]?/,
  /是不是\s*[零一二三四五六七八九十百千万]+[？?]?/,
  /是不是等于\s*\d+/,
  /难道是\s*\d+/,
]

/** 检测空洞智力表扬 */
const HOLLOW_PRAISE_PATTERNS = [
  /你真聪明/,
  /你好厉害/,
  /你好棒/,
  /这道题很简单/,
  /你应该会的/,
  /这个很容易/,
]

function countQuestions(content: string): number {
  const matches = content.match(/[？?]/g)
  return matches ? matches.length : 0
}

function countSentences(content: string): number {
  const sentences = content.split(/[。？！?!]+/).filter((s) => s.trim().length > 0)
  return sentences.length
}

export function auditAiResponse(content: string): AuditResult {
  const issues: string[] = []

  // 1. 检测直接给答案
  for (const pattern of ANSWER_PATTERNS) {
    if (pattern.test(content)) {
      const isFalsePositive = FALSE_POSITIVE_PATTERNS.some((fp) => fp.test(content))
      if (!isFalsePositive) {
        issues.push('可能泄露了答案')
        break
      }
    }
  }

  // 2. 检测直接确认答案
  for (const pattern of DIRECT_CONFIRM_PATTERNS) {
    if (pattern.test(content)) {
      issues.push('直接确认了答案，应追问过程')
      break
    }
  }

  // 3. 检测完整步骤
  for (const pattern of STEP_PATTERNS) {
    if (pattern.test(content)) {
      issues.push('可能给出了完整步骤')
      break
    }
  }

  // 4. 检测多个问题
  const questionCount = countQuestions(content)
  if (questionCount > 1) {
    issues.push(`一次问了${questionCount}个问题`)
  }

  // 5. 检测回复过长
  const sentenceCount = countSentences(content)
  if (sentenceCount > 4) {
    issues.push(`回复过长（${sentenceCount}句）`)
  }

  // 6. 检测间接暗示答案
  for (const pattern of INDIRECT_HINT_PATTERNS) {
    if (pattern.test(content)) {
      issues.push('以反问形式暗示了答案')
      break
    }
  }

  // 7. 检测是非题
  for (const pattern of YES_NO_PATTERNS) {
    if (pattern.test(content)) {
      issues.push('问了是非题，孩子会只答嗯/对')
      break
    }
  }

  // 8. 检测空洞智力表扬
  for (const pattern of HOLLOW_PRAISE_PATTERNS) {
    if (pattern.test(content)) {
      issues.push('使用了空洞智力表扬')
      break
    }
  }

  return {
    isCompliant: issues.length === 0,
    issues,
  }
}

/**
 * Audit whiteboard steps for answer leakage.
 * Returns filtered steps with answer-leaking steps removed.
 */
export function auditWhiteboardSteps(
  steps: Array<{ id: number; label: string; math?: string; hint?: string }>
): { filtered: typeof steps; issues: string[] } {
  const issues: string[] = []
  const filtered = steps.filter(step => {
    const trimmed = step.math?.trim() ?? ''
    // "x = 3" pattern: single variable = number
    if (trimmed && /^[a-zA-Z]\s*=\s*-?\d+(\.\d+)?\s*$/.test(trimmed)) {
      issues.push(`Step ${step.id}: math 可能泄露答案 "${step.math}"`)
      return false
    }
    // "= 15" pattern: bare equals number
    if (trimmed && /^\s*=\s*-?\d+(\.\d+)?\s*$/.test(trimmed)) {
      issues.push(`Step ${step.id}: math 可能泄露答案 "${step.math}"`)
      return false
    }
    // Label starts with answer keywords
    if (/^(答案|结果|得|最终)/.test(step.label)) {
      issues.push(`Step ${step.id}: label 包含答案关键词 "${step.label}"`)
      return false
    }
    return true
  })
  return { filtered, issues }
}
