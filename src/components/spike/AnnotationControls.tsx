// 标注调试控制面板 -- 预设标注 + JSON 手动输入 + OCR 行索引参考
import { useState } from 'react'
import type { OcrDetailedResult, AiAnnotation } from '../../types/ocr'

interface AnnotationControlsProps {
  ocrData: OcrDetailedResult | null
  onAnnotate: (annotations: AiAnnotation[]) => void
}

export default function AnnotationControls({ ocrData, onAnnotate }: AnnotationControlsProps) {
  const [jsonInput, setJsonInput] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  if (!ocrData) return null

  // 预设标注示例
  const presets: { label: string; annotations: AiAnnotation[] }[] = [
    {
      label: 'Circle L0',
      annotations: [{ type: 'circle', target: { line: 0 } }],
    },
    {
      label: 'Underline L1',
      annotations: [{ type: 'underline', target: { line: Math.min(1, ocrData.line_texts.length - 1) } }],
    },
    {
      label: 'Arrow -> L0',
      annotations: [{ type: 'arrow', target: { line: 0 }, label: 'look' }],
    },
    {
      label: 'Highlight L0 chars 0-2',
      annotations: [{ type: 'highlight', target: { line: 0, charStart: 0, charEnd: 2 } }],
    },
    {
      label: 'Bracket L0',
      annotations: [{ type: 'bracket', target: { line: 0 } }],
    },
    {
      label: 'Clear all',
      annotations: [],
    },
  ]

  // 解析手动 JSON 输入
  const handleApplyJson = () => {
    setJsonError(null)
    try {
      const parsed = JSON.parse(jsonInput)
      if (!Array.isArray(parsed)) {
        setJsonError('JSON must be an array of AiAnnotation objects')
        return
      }
      onAnnotate(parsed as AiAnnotation[])
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  return (
    <div className="p-3 rounded-lg bg-gray-100 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Annotation Controls</h3>

      {/* OCR 行索引参考 */}
      <div className="text-xs bg-white p-2 rounded font-mono max-h-32 overflow-auto">
        {ocrData.line_texts.map((text, i) => (
          <div key={i} className="text-gray-600">
            <span className="text-blue-600 font-bold">[L{i}]</span> {text}
          </div>
        ))}
        {ocrData.line_texts.length === 0 && (
          <div className="text-gray-400">No OCR lines detected</div>
        )}
      </div>

      {/* 预设标注按钮 */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset, i) => (
          <button
            key={i}
            onClick={() => onAnnotate(preset.annotations)}
            className="px-2 py-1 text-xs rounded bg-white border border-gray-300 hover:bg-blue-50 hover:border-blue-300 transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* JSON 手动输入 */}
      <div>
        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          placeholder='[{"type":"circle","target":{"line":0}}]'
          className="w-full h-20 p-2 text-xs font-mono border rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        {jsonError && (
          <div className="text-xs text-red-600 mt-1">{jsonError}</div>
        )}
        <button
          onClick={handleApplyJson}
          disabled={!jsonInput.trim()}
          className="mt-1 px-3 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Apply JSON
        </button>
      </div>
    </div>
  )
}
