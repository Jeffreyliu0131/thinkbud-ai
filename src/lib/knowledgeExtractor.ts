// 客户端知识点提取工具
// 在对话结束后调用 /api/extract-knowledge 端点，并将结果写入 IndexedDB

import type { KnowledgePoint, KnowledgePointRecord, Subject } from '../types'
import { getKnowledgePoint, putKnowledgePoint } from './db'
import { updateBKT, DEFAULT_BKT_PARAMS } from './bkt'

interface ExtractParams {
  messages: Array<{ role: string; content: string }>
  subject: Subject
  userId: string
}

interface ExtractResult {
  points: KnowledgePoint[]
  syncedToIdb: number   // 成功写入 IndexedDB 的条目数
}

/**
 * 从对话中提取知识点并同步到 IndexedDB
 * 调用服务端 /api/extract-knowledge 端点（含 D1 写入），
 * 再将结果 upsert 到本地 IndexedDB 以便离线查询。
 *
 * 失败时静默返回 — 知识提取是非关键路径，不应阻断对话流程。
 */
export async function extractAndSyncKnowledge(params: ExtractParams): Promise<ExtractResult> {
  const { messages, subject, userId } = params

  if (messages.length === 0) {
    return { points: [], syncedToIdb: 0 }
  }

  let points: KnowledgePoint[] = []

  try {
    const res = await fetch('/api/extract-knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, subject }),
    })

    if (!res.ok) {
      console.warn('[knowledgeExtractor] API 返回错误:', res.status)
      return { points: [], syncedToIdb: 0 }
    }

    const data = await res.json() as { points?: KnowledgePoint[] }
    points = data.points ?? []
  } catch (err) {
    console.warn('[knowledgeExtractor] 网络请求失败:', err)
    return { points: [], syncedToIdb: 0 }
  }

  if (points.length === 0) {
    return { points: [], syncedToIdb: 0 }
  }

  // 同步到 IndexedDB
  let syncedToIdb = 0
  const now = Date.now()

  await Promise.all(
    points.map(async (point) => {
      try {
        const key = `${userId}:${point.subject}:${point.concept}`
        const existing = await getKnowledgePoint(key)

        let record: KnowledgePointRecord
        if (existing) {
          if (point.signal === 'neutral') {
            // Neutral: increment encounters only, skip BKT (no observation)
            record = {
              ...existing,
              encounters: existing.encounters + 1,
              lastSeen: now,
            }
          } else {
            // Mastery/struggle: BKT posterior update
            const isCorrect = point.signal === 'mastery'
            const newConfidence = updateBKT(existing.confidence, isCorrect)
            record = {
              ...existing,
              encounters: existing.encounters + 1,
              masterySignals: existing.masterySignals + (isCorrect ? 1 : 0),
              struggleSignals: existing.struggleSignals + (isCorrect ? 0 : 1),
              confidence: newConfidence,
              lastSeen: now,
            }
          }
        } else {
          // New record: apply BKT from default prior (0.5)
          const prior = DEFAULT_BKT_PARAMS.pL0
          const isCorrect = point.signal === 'mastery'
          const newConfidence = point.signal === 'neutral' ? prior : updateBKT(prior, isCorrect)
          record = {
            key,
            userId,
            concept: point.concept,
            subject: point.subject,
            label: point.label,
            confidence: newConfidence,
            encounters: 1,
            masterySignals: point.signal === 'mastery' ? 1 : 0,
            struggleSignals: point.signal === 'struggle' ? 1 : 0,
            lastSeen: now,
            createdAt: now,
          }
        }

        await putKnowledgePoint(record)
        syncedToIdb++
      } catch (err) {
        console.warn('[knowledgeExtractor] IndexedDB 写入失败:', point.concept, err)
      }
    })
  )

  return { points, syncedToIdb }
}
