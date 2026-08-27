// 统一 HTTP 响应工具

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  })
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status)
}

export function audioResponse(audioBuffer: ArrayBuffer | Uint8Array, contentType = 'audio/mpeg'): Response {
  const body = audioBuffer instanceof Uint8Array
    ? Uint8Array.from(audioBuffer).buffer
    : audioBuffer
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    },
  })
}
