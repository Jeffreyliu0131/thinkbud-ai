// 白板 Spike 原型页面 -- 拍照/选图 -> OCR 识别 -> canvas bbox 叠加 + AI 标注
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import AnnotationCanvas from '../components/spike/AnnotationCanvas'
import AnnotationControls from '../components/spike/AnnotationControls'
import { resolveAnnotation } from '../types/ocr'
import type { OcrDetailedResult, AiAnnotation } from '../types/ocr'

export default function WhiteboardSpikePage() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const prevBlobUrlRef = useRef<string | null>(null)

  // Revoke blob URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current)
    }
  }, [])
  const [ocrData, setOcrData] = useState<OcrDetailedResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBboxes, setShowBboxes] = useState(true)
  const [showChars, setShowChars] = useState(false)
  const [base64Image, setBase64Image] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<AiAnnotation[]>([])

  // 将 AI 标注指令解析为 canvas 坐标
  const resolvedAnnotations = useMemo(() => {
    if (!ocrData || annotations.length === 0) return []
    return annotations
      .map(a => resolveAnnotation(a, ocrData))
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [annotations, ocrData])

  // 处理图片选择
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setOcrData(null)

    // 创建预览 URL（先释放旧的防止内存泄漏）
    if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current)
    const url = URL.createObjectURL(file)
    prevBlobUrlRef.current = url
    setImageUrl(url)

    // 转 base64
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip "data:image/...;base64," prefix
      const base64 = result.split(',')[1]
      setBase64Image(base64)
    }
    reader.readAsDataURL(file)
  }, [])

  // 调用 OCR API
  const handleRecognize = useCallback(async () => {
    if (!base64Image) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/ocr-detailed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ image: base64Image }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error((err as { error?: string }).error || `请求失败 (${res.status})`)
      }

      const data = await res.json() as OcrDetailedResult
      setOcrData(data)
      console.log('[Spike] OCR raw_keys:', data.raw_keys)
      console.log('[Spike] OCR line_texts:', data.line_texts)
      console.log('[Spike] OCR line_rects count:', data.line_rects?.length)
      console.log('[Spike] OCR chars count:', data.chars?.length)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OCR 请求失败'
      setError(msg)
      console.error('[Spike] OCR error:', err)
    } finally {
      setLoading(false)
    }
  }, [base64Image])

  return (
    <div className="max-w-md mx-auto p-4 min-h-screen bg-white">
      <h1 className="text-xl font-bold mb-4">白板 Spike 原型</h1>

      {/* 图片输入 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          选择或拍摄作业照片
        </label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {/* 识别按钮 */}
      {base64Image && (
        <button
          onClick={handleRecognize}
          disabled={loading}
          className="w-full py-3 px-4 rounded-lg text-white font-medium mb-4 disabled:opacity-50"
          style={{ backgroundColor: loading ? '#9ca3af' : '#3b82f6' }}
        >
          {loading ? '识别中...' : '开始 OCR 识别'}
        </button>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 调试开关 */}
      {ocrData && (
        <div className="mb-4 flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={showBboxes}
              onChange={(e) => setShowBboxes(e.target.checked)}
            />
            显示行框
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={showChars}
              onChange={(e) => setShowChars(e.target.checked)}
            />
            显示字符框
          </label>
        </div>
      )}

      {/* Canvas 标注区域 */}
      {imageUrl && (
        <div className="mb-4 border rounded-lg overflow-hidden">
          <AnnotationCanvas
            imageUrl={imageUrl}
            ocrData={ocrData}
            showBboxes={showBboxes}
            showChars={showChars}
            resolvedAnnotations={resolvedAnnotations}
          />
        </div>
      )}

      {/* 标注控制面板 */}
      {ocrData && (
        <div className="mb-4">
          <AnnotationControls ocrData={ocrData} onAnnotate={setAnnotations} />
        </div>
      )}

      {/* 原始数据调试区 */}
      {ocrData && (
        <div className="mb-4">
          <h2 className="text-sm font-medium text-gray-700 mb-1">调试数据</h2>
          <pre className="p-3 bg-gray-50 rounded-lg text-xs overflow-auto max-h-60">
            <strong>raw_keys:</strong> {JSON.stringify(ocrData.raw_keys, null, 2)}
            {'\n\n'}
            <strong>line_texts:</strong> {JSON.stringify(ocrData.line_texts, null, 2)}
            {'\n\n'}
            <strong>line_rects ({ocrData.line_rects?.length || 0}):</strong>{' '}
            {JSON.stringify(ocrData.line_rects?.slice(0, 3), null, 2)}
            {ocrData.line_rects?.length > 3 ? '\n... (truncated)' : ''}
            {'\n\n'}
            <strong>chars ({ocrData.chars?.length || 0}):</strong>{' '}
            {JSON.stringify(ocrData.chars?.slice(0, 5), null, 2)}
            {ocrData.chars?.length > 5 ? '\n... (truncated)' : ''}
          </pre>
        </div>
      )}
    </div>
  )
}
