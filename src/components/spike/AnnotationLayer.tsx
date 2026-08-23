// AI 标注渲染层 -- 根据解析后的坐标渲染圆圈/下划线/箭头/括号/高亮
import { Rect, Line, Arrow, Text } from 'react-konva'
import type { ResolvedAnnotation } from '../../types/ocr'

interface AnnotationLayerProps {
  annotations: ResolvedAnnotation[]
}

/** 渲染单个标注形状 */
function renderAnnotation(a: ResolvedAnnotation, i: number) {
  const padding = 6
  const elements: React.ReactNode[] = []

  switch (a.type) {
    case 'circle':
      elements.push(
        <Rect
          key={`ann-circle-${i}`}
          x={a.x - padding}
          y={a.y - padding}
          width={a.width + padding * 2}
          height={a.height + padding * 2}
          cornerRadius={8}
          stroke={a.color}
          strokeWidth={2.5}
          fill={a.color.replace(')', ',0.08)').replace('rgb', 'rgba')}
          opacity={0.9}
        />
      )
      break

    case 'underline':
      elements.push(
        <Line
          key={`ann-underline-${i}`}
          points={[a.x, a.y + a.height + 3, a.x + a.width, a.y + a.height + 3]}
          stroke={a.color}
          strokeWidth={3}
          lineCap="round"
        />
      )
      break

    case 'arrow':
      elements.push(
        <Arrow
          key={`ann-arrow-${i}`}
          points={[a.x - 40, a.y + a.height / 2, a.x - padding, a.y + a.height / 2]}
          stroke={a.color}
          strokeWidth={2.5}
          fill={a.color}
          pointerLength={8}
          pointerWidth={6}
        />
      )
      break

    case 'bracket': {
      const bx = a.x - padding
      const by = a.y - padding
      const bw = a.width + padding * 2
      const bh = a.height + padding * 2
      const tab = 6
      // 左方括号
      elements.push(
        <Line
          key={`ann-bracket-l-${i}`}
          points={[bx + tab, by, bx, by, bx, by + bh, bx + tab, by + bh]}
          stroke={a.color}
          strokeWidth={2.5}
          lineCap="round"
          lineJoin="round"
        />
      )
      // 右方括号
      elements.push(
        <Line
          key={`ann-bracket-r-${i}`}
          points={[bx + bw - tab, by, bx + bw, by, bx + bw, by + bh, bx + bw - tab, by + bh]}
          stroke={a.color}
          strokeWidth={2.5}
          lineCap="round"
          lineJoin="round"
        />
      )
      break
    }

    case 'highlight':
      elements.push(
        <Rect
          key={`ann-highlight-${i}`}
          x={a.x}
          y={a.y}
          width={a.width}
          height={a.height}
          fill="#fbbf24"
          opacity={0.3}
        />
      )
      break
  }

  // 可选文字标签
  if (a.label) {
    elements.push(
      <Text
        key={`ann-label-${i}`}
        x={a.x + a.width + 4}
        y={a.y}
        text={a.label}
        fontSize={14}
        fill={a.color}
        fontStyle="bold"
      />
    )
  }

  return elements
}

export default function AnnotationLayer({ annotations }: AnnotationLayerProps) {
  return (
    <>
      {annotations.map((a, i) => renderAnnotation(a, i))}
    </>
  )
}
