const API_BASE = '/api'

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT = 30_000

/**
 * 带超时的 fetch 封装
 * 超时后自动 abort，抛出友好错误
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, signal: externalSignal, ...fetchOptions } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  // 如果调用方也传了 signal，监听外部 abort
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal })
    clearTimeout(timeoutId)
    return res
  } catch (err) {
    clearTimeout(timeoutId)
    if ((err as Error).name === 'AbortError') {
      // 区分超时 vs 外部取消
      if (externalSignal?.aborted) {
        throw err // 外部取消，保持原始 AbortError
      }
      throw new Error('请求超时，请检查网络后重试')
    }
    throw err
  }
}

export async function recognizeImage(imageBase64: string): Promise<string> {
  // Strip data URL prefix to get raw base64
  const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, '')

  const res = await fetchWithTimeout(`${API_BASE}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64 }),
    timeout: 15_000, // OCR 15 秒超时
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OCR失败: ${err}`)
  }

  const data = await res.json()
  return data.text
}
