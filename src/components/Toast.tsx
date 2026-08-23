import { createContext, useContext, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'

type ToastType = 'error' | 'info' | 'success'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const TOAST_COLORS: Record<ToastType, string> = {
  error: 'bg-red-50 border-red-200 text-red-700',
  info: 'bg-teal-50 border-teal-200 text-teal-700',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
}

const TOAST_ICONS: Record<ToastType, string> = {
  error: '⚠️',
  info: 'ℹ️',
  success: '✅',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const showToast = useCallback((message: string, type: ToastType = 'error') => {
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, message, type }])

    // 3 秒后自动消失
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast 渲染 — 移动端用 safe-area 避开刘海 */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4"
        style={{ top: 'max(1rem, var(--safe-top))' }}
        aria-live="assertive"
        role="alert"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-2xl border shadow-lg backdrop-blur-sm text-sm font-medium animate-fade-up ${TOAST_COLORS[toast.type]}`}
          >
            <span aria-hidden="true">{TOAST_ICONS[toast.type]}</span>
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              aria-label="关闭提示"
              className="text-current opacity-50 hover:opacity-100 ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
