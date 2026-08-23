import type { RefObject } from 'react'
import { Camera } from 'lucide-react'

interface CameraPreviewProps {
  videoRef: RefObject<HTMLVideoElement | null>
  isOpen: boolean
  error: string | null
  capturedImage?: string | null
  hasOcr?: boolean
  onCapture?: () => void
  isOcrLoading?: boolean
}

/**
 * 摄像头预览卡片 — 16:9 圆角，能看清作业内容
 * 拍照后显示截帧，否则显示实时视频 + 拍题按钮
 */
export default function CameraPreview({
  videoRef,
  isOpen,
  error,
  capturedImage,
  hasOcr,
  onCapture,
  isOcrLoading,
}: CameraPreviewProps) {
  return (
    <div
      className="relative w-full aspect-video rounded-2xl overflow-hidden bg-gray-100 border border-teal-100 shadow-md md:rounded-3xl ring-1 ring-black/[0.03]"
      role="region"
      aria-label={capturedImage ? '已拍摄的作业照片' : '摄像头实时预览'}
    >
      {/* 实时视频 */}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-cover ${capturedImage ? 'opacity-0' : 'opacity-100'}`}
        playsInline
        muted
        autoPlay
        aria-label="摄像头实时画面"
      />

      {/* 拍照截帧叠加 */}
      {capturedImage && (
        <img
          src={capturedImage}
          alt="拍摄的作业题目"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* 摄像头未就绪提示 */}
      {!isOpen && !capturedImage && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50">
          <div className="text-center text-gray-500 px-4">
            <p className="text-2xl mb-1" aria-hidden="true">📷</p>
            <p className="text-xs text-gray-600 font-medium mb-1">对着作业题拍一张，我来帮你看</p>
            <p className="text-xs text-gray-500">{error ? '摄像头打不开呢，不过没关系，直接说题目也可以' : '正在启动摄像头…'}</p>
          </div>
        </div>
      )}

      {/* 顶部角标 — 暖色风格 */}
      {isOpen && !capturedImage && (
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-white/80 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm" aria-hidden="true">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-gray-600 text-xs font-medium">实时</span>
        </div>
      )}

      {/* 拍题按钮 — 摄像头就绪、未拍照、未自动识别时显示 */}
      {isOpen && !capturedImage && !hasOcr && onCapture && (
        <button
          onClick={onCapture}
          disabled={isOcrLoading}
          aria-label="拍题"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-teal-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg shadow-teal-500/25 active:scale-95 transition-all hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Camera size={16} />
          拍题
        </button>
      )}

      {/* 底部标签 — OCR 状态（手动拍题或自动识别） */}
      {(capturedImage || hasOcr) && (
        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-white/80 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm" aria-hidden="true">
          {isOcrLoading ? (
            <span className="text-amber-600 text-xs font-medium">识别中...</span>
          ) : (
            <span className="text-teal-600 text-xs font-medium">{capturedImage ? '✓ 已拍题' : '✓ 已识别'}</span>
          )}
        </div>
      )}
    </div>
  )
}
