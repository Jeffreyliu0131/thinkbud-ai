// react-konva 标注画布 -- 加载图片并覆盖 OCR bbox 标注层 + AI 标注层
import { useRef, useEffect, useState } from 'react'
import { Stage, Layer, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import OcrOverlay from './OcrOverlay'
import AnnotationLayer from './AnnotationLayer'
import type { OcrDetailedResult, ResolvedAnnotation } from '../../types/ocr'

interface AnnotationCanvasProps {
  imageUrl: string
  ocrData: OcrDetailedResult | null
  showBboxes: boolean
  showChars: boolean
  resolvedAnnotations?: ResolvedAnnotation[]
}

export default function AnnotationCanvas({ imageUrl, ocrData, showBboxes, showChars, resolvedAnnotations }: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, scale: 1 })
  const [image] = useImage(imageUrl, 'anonymous')

  // 计算 scale 以适应容器宽度
  useEffect(() => {
    if (!image || !containerRef.current) return

    const containerWidth = containerRef.current.clientWidth
    const scale = containerWidth / image.naturalWidth
    setDimensions({
      width: containerWidth,
      height: image.naturalHeight * scale,
      scale,
    })
  }, [image])

  if (!image) {
    return <div className="text-center text-gray-400 py-8">加载图片中...</div>
  }

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <Stage
        width={dimensions.width}
        height={dimensions.height}
        scaleX={dimensions.scale}
        scaleY={dimensions.scale}
      >
        {/* Layer 1: 底图 */}
        <Layer>
          <KonvaImage image={image} />
        </Layer>

        {/* Layer 2: OCR bbox 叠加 */}
        {showBboxes && ocrData && (
          <Layer>
            <OcrOverlay
              lineRects={ocrData.line_rects}
              chars={ocrData.chars}
              showChars={showChars}
            />
          </Layer>
        )}

        {/* Layer 3: AI 标注层 */}
        <Layer>
          <AnnotationLayer annotations={resolvedAnnotations || []} />
        </Layer>
      </Stage>
    </div>
  )
}
