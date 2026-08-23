// GET /api/child/progress
// 孩子端学习进度 API：从 BKT 知识点数据聚合星级和标签
// 使用 peak_confidence（峰值掌握度）计算星星，永不降级

import { confidenceToLabel } from '../../../src/types/parent'
import { jsonResponse, errorResponse } from '../../_shared/utils/response'
import type { AppEnv, ContextData } from '../../_shared/env'
import type { ChildProgressResponse } from '../../../src/types/child'

// ===== D1 查询行类型 =====

interface KpRow {
  concept: string
  subject: string
  label: string
  peak_confidence: number
  encounters: number
}

// ===== 安全 D1 查询（表可能不存在时使用）=====

async function safeQueryAll<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<D1Result<T>> {
  try {
    return await db.prepare(sql).bind(...binds).all<T>()
  } catch {
    return { results: [], success: true, meta: {} as D1Result<T>['meta'] }
  }
}

// ===== 学科中文标签 =====

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学',
  chinese: '语文',
  english: '英语',
}

// ===== 主 handler =====

export const onRequestGet: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const userId = context.data.userId
    if (!userId) {
      return errorResponse('未登录', 401)
    }

    const db = context.env.DB

    // 查询知识点，使用 COALESCE 优先取 peak_confidence
    const knowledgePoints = await safeQueryAll<KpRow>(db, `
      SELECT concept, subject, label,
        COALESCE(peak_confidence, confidence) as peak_confidence,
        encounters
      FROM knowledge_points
      WHERE user_id = ?
      ORDER BY subject, peak_confidence DESC
    `, userId)

    // 按学科分组
    const subjectMap = new Map<string, { label: string; points: Array<{
      concept: string
      label: string
      stars: 1 | 2 | 3
      starLabel: string
      encounters: number
    }> }>()

    for (const row of knowledgePoints.results) {
      const { label: starLabel, level } = confidenceToLabel(row.peak_confidence)
      const stars: 1 | 2 | 3 = level === 'low' ? 1 : level === 'mid' ? 2 : 3

      const point = {
        concept: row.concept,
        label: row.label,
        stars,
        starLabel,
        encounters: row.encounters,
      }

      const existing = subjectMap.get(row.subject)
      if (existing) {
        existing.points.push(point)
      } else {
        subjectMap.set(row.subject, {
          label: SUBJECT_LABELS[row.subject] ?? row.subject,
          points: [point],
        })
      }
    }

    // 查询会话总数（用于冷启动等级判定）
    const countResult = await safeQueryAll<{ count: number }>(db,
      'SELECT COUNT(*) as count FROM conversations WHERE user_id = ?', userId)
    const sessionCount = countResult.results[0]?.count ?? 0

    // 构建响应：只包含有知识点的学科，冷启动返回空 subjects
    const subjects: ChildProgressResponse['subjects'] = {}
    for (const [key, value] of subjectMap.entries()) {
      subjects[key] = value
    }

    return jsonResponse({ subjects, sessionCount } satisfies ChildProgressResponse)
  } catch (err) {
    console.error('[ChildProgress]', err)
    return errorResponse('获取学习进度失败')
  }
}
