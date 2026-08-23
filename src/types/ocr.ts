// OCR 完整响应类型定义
// 基于 07-RESEARCH.md 的字段推测 -- 运行时 console.log 验证后再调整

export interface OcrLineRect {
  x: number
  y: number
  width: number
  height: number
}

export interface OcrChar {
  char: string
  x: number
  y: number
  width: number
  height: number
  score: number
}

/** 火山引擎 OCRNormal 原始 data 字段（字段可能不存在，运行时验证） */
export interface OcrDetailedData {
  line_texts: string[]
  line_rects?: OcrLineRect[]
  chars?: OcrChar[]
  polygons?: number[][][]
}

/** 火山引擎 OCRNormal 完整 HTTP 响应 */
export interface OcrDetailedResponse {
  code: number
  message: string
  request_id: string
  data: OcrDetailedData
}

/** 前端使用的简化类型（ocr-detailed 端点返回） */
export interface OcrDetailedResult {
  line_texts: string[]
  line_rects: OcrLineRect[]
  chars: OcrChar[]
  polygons: number[][][]
  raw_keys: string[] // 返回 data 对象的所有 key，用于运行时验证
}

// ── AI 标注指令类型 ──

/** 标注形状类型 */
export type AnnotationType = 'circle' | 'underline' | 'arrow' | 'bracket' | 'highlight'

/** AI 标注指令 — LLM 输出结构化 JSON，引用 OCR 行/字符索引 */
export interface AiAnnotation {
  type: AnnotationType
  target: {
    line: number           // 行索引（对应 line_texts/line_rects 的 index）
    charStart?: number     // 行内字符起始索引
    charEnd?: number       // 行内字符结束索引
  }
  label?: string           // 可选文字标签
  color?: string           // 可选颜色覆盖
}

/** 解析后的 canvas 坐标（可直接渲染） */
export interface ResolvedAnnotation {
  type: AnnotationType
  x: number
  y: number
  width: number
  height: number
  label?: string
  color: string
}

/** 默认标注颜色映射 */
const defaultColors: Record<AnnotationType, string> = {
  circle: '#ef4444',      // red
  underline: '#f59e0b',   // amber
  arrow: '#8b5cf6',       // violet
  bracket: '#06b6d4',     // cyan
  highlight: '#fbbf2480', // amber 半透明
}

/**
 * 将 AI 标注指令解析为 canvas 坐标
 * 通过 OCR line_rects/chars 索引映射到像素位置
 */
export function resolveAnnotation(
  annotation: AiAnnotation,
  ocrData: OcrDetailedResult
): ResolvedAnnotation | null {
  const { line, charStart, charEnd } = annotation.target

  // 边界检查
  if (line < 0 || line >= ocrData.line_rects.length) return null

  const lineRect = ocrData.line_rects[line]
  let targetRect = { ...lineRect }

  // 如果指定了字符范围且有 chars 数据，尝试精确定位
  if (charStart !== undefined && charEnd !== undefined && ocrData.chars.length > 0) {
    const lineText = ocrData.line_texts[line] || ''
    // 计算当前行之前的字符数（用于在 chars 数组中定位）
    let charOffset = 0
    for (let i = 0; i < line; i++) {
      charOffset += (ocrData.line_texts[i] || '').length
    }

    const startIdx = charOffset + Math.max(0, charStart)
    const endIdx = charOffset + Math.min(lineText.length - 1, charEnd)

    if (startIdx < ocrData.chars.length && endIdx < ocrData.chars.length) {
      const startChar = ocrData.chars[startIdx]
      const endChar = ocrData.chars[endIdx]
      targetRect = {
        x: startChar.x,
        y: Math.min(startChar.y, endChar.y),
        width: (endChar.x + endChar.width) - startChar.x,
        height: Math.max(startChar.height, endChar.height),
      }
    }
    // 如果 chars 索引越界，fall back 到 lineRect（上面已设置）
  }

  return {
    type: annotation.type,
    x: targetRect.x,
    y: targetRect.y,
    width: targetRect.width,
    height: targetRect.height,
    label: annotation.label,
    color: annotation.color || defaultColors[annotation.type] || '#ef4444',
  }
}
