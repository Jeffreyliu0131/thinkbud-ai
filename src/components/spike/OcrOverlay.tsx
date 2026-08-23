// OCR bbox 叠加层 -- 渲染 line_rects 和 chars 的 bounding box
import { Rect } from 'react-konva'
import type { OcrLineRect, OcrChar } from '../../types/ocr'

interface OcrOverlayProps {
  lineRects: OcrLineRect[]
  chars: OcrChar[]
  showChars: boolean
}

export default function OcrOverlay({ lineRects, chars, showChars }: OcrOverlayProps) {
  return (
    <>
      {/* 行级别 bbox -- 绿色半透明 */}
      {lineRects.map((rect, i) => (
        <Rect
          key={`line-${i}`}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          stroke="#22c55e"
          strokeWidth={2}
          opacity={0.4}
        />
      ))}

      {/* 字符级别 bbox -- 蓝色半透明 */}
      {showChars && chars.map((c, i) => (
        <Rect
          key={`char-${i}`}
          x={c.x}
          y={c.y}
          width={c.width}
          height={c.height}
          stroke="#3b82f6"
          strokeWidth={1}
          opacity={0.3}
        />
      ))}
    </>
  )
}
