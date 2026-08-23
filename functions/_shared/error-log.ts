// 错误日志写入工具（ARCH-04: 生产错误可观测）
// 服务端和客户端错误统一写入 D1 error_logs 表

export async function logError(
  db: D1Database,
  source: 'server' | 'client',
  message: string,
  opts?: { path?: string; stack?: string; meta?: Record<string, unknown>; userId?: string }
): Promise<void> {
  try {
    await db.prepare(
      'INSERT INTO error_logs (source, path, message, stack, meta, user_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      source,
      opts?.path ?? null,
      message.substring(0, 1000),
      opts?.stack?.substring(0, 4000) ?? null,
      opts?.meta ? JSON.stringify(opts.meta) : null,
      opts?.userId ?? null
    ).run()
  } catch (e) {
    console.error('[error-log] Failed to write error log:', e)
  }
}
