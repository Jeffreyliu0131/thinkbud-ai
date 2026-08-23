// 管理后台错误日志查询端点
// 分页查询 error_logs 表

import type { AppEnv } from '../../_shared/env'

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const url = new URL(context.request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0

  const { results } = await context.env.DB.prepare(
    'SELECT * FROM error_logs ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(limit, offset).all()

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  })
}
