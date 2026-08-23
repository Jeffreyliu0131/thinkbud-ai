// GET /api/admin/stats — 管理后台：使用统计
import type { AppEnv } from '../../_shared/env'
import { getStats } from '../../_shared/db'
import { jsonResponse, errorResponse } from '../../_shared/utils/response'

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  try {
    const stats = await getStats(context.env.DB)

    // 额外分析统计
    const db = context.env.DB
    const [resolution, subjects, compliance] = await Promise.all([
      db.prepare(`SELECT resolution_type, COUNT(*) as cnt FROM conversations WHERE resolution_type IS NOT NULL GROUP BY resolution_type`).all<{ resolution_type: string; cnt: number }>(),
      db.prepare(`SELECT subject, COUNT(*) as cnt FROM conversations WHERE subject IS NOT NULL GROUP BY subject`).all<{ subject: string; cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM messages WHERE compliance_issues IS NOT NULL AND compliance_issues != '[]'`).first<{ cnt: number }>(),
    ])

    return jsonResponse({
      stats: {
        ...stats,
        resolutionBreakdown: resolution.results,
        subjectBreakdown: subjects.results,
        complianceIssueCount: compliance?.cnt || 0,
      }
    })
  } catch (err) {
    console.error('[AdminStats]', err)
    return errorResponse('获取统计数据失败')
  }
}
