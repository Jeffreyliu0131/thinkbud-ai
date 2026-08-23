// 客户端错误上报器（ARCH-04: 生产错误可观测）
// fire-and-forget 模式，不阻塞 UI，不抛异常

const ERROR_REPORT_URL = '/api/error-report'

export function reportError(message: string, opts?: { stack?: string; meta?: Record<string, unknown> }): void {
  try {
    const body = JSON.stringify({
      message: message.substring(0, 1000),
      stack: opts?.stack?.substring(0, 4000),
      path: window.location.pathname,
      meta: opts?.meta,
    })
    // Fire-and-forget — don't block UI or retry
    fetch(ERROR_REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'include',
    }).catch(() => {})
  } catch {
    // Swallow — error reporter must never throw
  }
}

export function installGlobalErrorHandler(): void {
  window.addEventListener('error', (event) => {
    reportError(event.message, {
      stack: event.error?.stack,
      meta: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    reportError(message, { stack, meta: { type: 'unhandledrejection' } })
  })
}
