import type { Subject } from '../types'

/**
 * 从任意文本推断学科（轻量启发式，用于知识追踪分桶）
 * 优先级：英文字符多 -> english；数字+运算符多 -> math；中文字符多 -> chinese
 * 用途：OCR 文本学科检测 + RTC 字幕文本 fallback 检测（per D-03）
 */
export function detectSubject(text: string | null): Subject | undefined {
  if (!text) return undefined
  const englishWords = (text.match(/\b[a-zA-Z]{2,}\b/g) || []).length
  if (englishWords >= 3) return 'english'
  const mathSignals = (text.match(/[0-9+\-×÷=×÷＋－＝（）()%]/g) || []).length
  if (mathSignals >= 4) return 'math'
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  if (chineseChars >= 5) return 'chinese'
  return undefined
}
