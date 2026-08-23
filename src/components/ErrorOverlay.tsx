import { useState, useEffect, useRef } from 'react'
import { WifiOff, MicOff, Clock } from 'lucide-react'

type ErrorType = 'offline' | 'mic-denied' | 'timeout' | null

interface ErrorOverlayProps {
  type: ErrorType
  onRetry?: () => void
  onDismiss?: () => void
}

const ERROR_CONFIG: Record<string, { icon: React.ReactNode; title: string; description: string; action: string; iosHint?: string }> = {
  offline: {
    icon: <WifiOff size={40} className="text-gray-400" />,
    title: '网络断开了',
    description: '检查一下 WiFi 或者手机数据，然后再试试',
    action: '重新连接',
  },
  'mic-denied': {
    icon: <MicOff size={40} className="text-gray-400" />,
    title: '需要麦克风权限',
    description: '思考教练需要听到你的声音才能帮助你',
    action: '重新请求权限',
    iosHint: 'iPhone/iPad 用户：打开 设置 → Safari → 网站 → 麦克风 → 允许',
  },
  timeout: {
    icon: <Clock size={40} className="text-gray-400" />,
    title: 'AI 教练开小差了',
    description: '等了太久没有回应，再说一遍试试吧',
    action: '再试一次',
  },
}

export default function ErrorOverlay({ type, onRetry, onDismiss }: ErrorOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Escape 关闭
  useEffect(() => {
    if (!type) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onDismiss) {
        onDismiss()
      }
    }
    window.addEventListener('keydown', handleKey)
    // 打开时聚焦对话框
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', handleKey)
  }, [type, onDismiss])

  // Focus trap: keep Tab within the dialog
  useEffect(() => {
    if (!type) return
    const modal = dialogRef.current
    if (!modal) return

    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstEl = focusableElements[0]
    const lastEl = focusableElements[focusableElements.length - 1]

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (focusableElements.length === 0) return

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }

    modal.addEventListener('keydown', handleKeyDown)
    return () => modal.removeEventListener('keydown', handleKeyDown)
  }, [type])

  if (!type) return null

  const config = ERROR_CONFIG[type]
  if (!config) return null

  return (
    <div
      className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-overlay-title"
      aria-describedby="error-overlay-desc"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-sm mx-4 mb-8 bg-[var(--color-bg-card)] rounded-[var(--radius-card)] shadow-xl p-6 animate-fade-up outline-none"
      >
        <div className="text-center">
          <div className="flex justify-center mb-3" aria-hidden="true">{config.icon}</div>
          <h3 id="error-overlay-title" className="text-lg font-bold text-[var(--color-text-primary)] mb-1">{config.title}</h3>
          <p id="error-overlay-desc" className="text-sm text-[var(--color-text-secondary)] mb-4">{config.description}</p>
          {config.iosHint && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 mb-4">{config.iosHint}</p>
          )}
        </div>
        <div className="flex gap-3">
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="flex-1 py-3 rounded-[var(--radius-pill)] text-sm font-normal text-[var(--color-text-secondary)] bg-gray-100 hover:bg-gray-200 transition-colors min-h-[var(--touch-min)]"
            >
              关闭
            </button>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex-1 py-3 text-sm font-bold text-white bg-teal-500 btn-3d btn-3d-teal transition-all"
            >
              {config.action}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Hook：监听网络状态变化 */
// eslint-disable-next-line react-refresh/only-export-components
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
