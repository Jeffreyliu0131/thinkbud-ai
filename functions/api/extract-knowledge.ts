// Cloudflare Pages Function: 知识点提取端点
// POST { messages, subject, userId? } → { points: KnowledgePoint[] }
// 调用 LLM 从对话消息中提取知识点，持久化到 D1

import { chatCompletionJSON } from '../_shared/providers/chat/ark'
import { jsonResponse, errorResponse } from '../_shared/utils/response'
import { checkUserRateLimit } from '../_shared/rate-limit'
import type { AppEnv, ContextData } from '../_shared/env'
import { KC_VOCABULARY, buildVocabString } from '../../shared/kcVocabulary'
import { updateBKT, DEFAULT_BKT_PARAMS } from '../../shared/bkt'
import type { KnowledgePoint } from '../../src/types'

const VALID_SUBJECTS = new Set(['math', 'chinese', 'english'])

// 每次提取最多处理的消息数（避免超长上下文）
const MAX_MESSAGES = 20

interface ExtractRequest {
  messages: Array<{ role: string; content: string }>
  subject: string
}

export interface ExtractedRaw {
  concept: string
  signal: 'mastery' | 'struggle' | 'neutral'
}

/** 构建知识点提取的 system prompt */
export function buildExtractionSystemPrompt(subject: string): string {
  const vocabStr = buildVocabString(subject as 'math' | 'chinese' | 'english')
  return `你是一个专门分析小学生学习对话的助手。
你的任务是从对话记录中识别出涉及的知识点，以及孩子对这些知识点的掌握程度。

【知识点词汇表（${subject}）】
${vocabStr}

【规则】
1. 只从上方词汇表中选择 concept 字段（英文标识符）
2. 根据对话内容判断孩子的掌握信号：
   - mastery（掌握）：孩子答对了、理解了、自己想出来了
   - struggle（困难）：孩子答错了、卡住了、多次尝试失败
   - neutral（中性）：知识点出现但信号不明确
3. 最多返回 5 个最相关的知识点
4. 只返回 JSON 数组，不要任何解释文字

【输出格式】
[
  {"concept": "carrying", "signal": "struggle"},
  {"concept": "make_ten", "signal": "mastery"}
]

如果对话中没有明确涉及任何知识点，返回空数组：[]`
}

/** 从 LLM 输出解析知识点列表，失败时返回空数组 */
export function parseExtractionResult(raw: string): ExtractedRaw[] {
  // 提取 JSON 数组（处理 LLM 可能包裹在 markdown 代码块里的情况）
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []

  try {
    const parsed = JSON.parse(match[0]) as unknown[]
    if (!Array.isArray(parsed)) return []

    return parsed.filter((item): item is ExtractedRaw => {
      if (!item || typeof item !== 'object') return false
      const obj = item as Record<string, unknown>
      return (
        typeof obj.concept === 'string' &&
        typeof obj.signal === 'string' &&
        ['mastery', 'struggle', 'neutral'].includes(obj.signal)
      )
    })
  } catch {
    return []
  }
}

/** 将 D1 写入知识点（upsert 模式，BKT 更新置信度） */
async function upsertKnowledgePoint(
  db: D1Database,
  userId: string,
  point: KnowledgePoint
): Promise<void> {
  // Neutral signal: increment encounters only, skip BKT update (no observation)
  if (point.signal === 'neutral') {
    await db.prepare(`
      INSERT INTO knowledge_points (user_id, concept, subject, label, confidence, peak_confidence, encounters, mastery_signals, struggle_signals)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0)
      ON CONFLICT(user_id, concept) DO UPDATE SET
        encounters = encounters + 1,
        label = excluded.label,
        last_seen = datetime('now')
    `).bind(userId, point.concept, point.subject, point.label, DEFAULT_BKT_PARAMS.pL0, DEFAULT_BKT_PARAMS.pL0).run()
    return
  }

  // Mastery/struggle signal: read current confidence, compute BKT posterior, write new value
  const existing = await db.prepare(
    `SELECT confidence FROM knowledge_points WHERE user_id = ? AND concept = ?`
  ).bind(userId, point.concept).first<{ confidence: number }>()

  const prior = existing?.confidence ?? DEFAULT_BKT_PARAMS.pL0
  const isCorrect = point.signal === 'mastery'
  const newConfidence = updateBKT(prior, isCorrect)

  await db.prepare(`
    INSERT INTO knowledge_points (user_id, concept, subject, label, confidence, peak_confidence, encounters, mastery_signals, struggle_signals)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(user_id, concept) DO UPDATE SET
      encounters = encounters + 1,
      mastery_signals = mastery_signals + excluded.mastery_signals,
      struggle_signals = struggle_signals + excluded.struggle_signals,
      confidence = ?,
      peak_confidence = MAX(COALESCE(knowledge_points.peak_confidence, knowledge_points.confidence), ?),
      label = excluded.label,
      last_seen = datetime('now')
  `).bind(
    userId, point.concept, point.subject, point.label, newConfidence, newConfidence,
    isCorrect ? 1 : 0, isCorrect ? 0 : 1,
    newConfidence, newConfidence
  ).run()
}

export const onRequestPost: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const userId = context.data.userId
    if (!userId) {
      return errorResponse('未登录', 401)
    }

    const rateCheck = await checkUserRateLimit(context.env.DB, userId, 'extract-knowledge', 5, 1)
    if (!rateCheck.allowed) {
      return errorResponse('请求过于频繁，请稍后再试', 429)
    }

    const { messages, subject }: ExtractRequest = await context.request.json()

    if (!Array.isArray(messages) || !subject) {
      return errorResponse('参数格式错误', 400)
    }
    if (!VALID_SUBJECTS.has(subject)) {
      return errorResponse('无效的 subject 参数', 400)
    }
    if (messages.length === 0) {
      return jsonResponse({ points: [] })
    }

    // 截取最近的消息（避免超长上下文）
    const recentMessages = messages.slice(-MAX_MESSAGES)

    // 构建对话摘要供 LLM 分析
    const conversationText = recentMessages
      .map(m => `${m.role === 'user' ? '孩子' : 'AI教练'}: ${m.content}`)
      .join('\n')

    const systemPrompt = buildExtractionSystemPrompt(subject)
    const userMessage = `请分析以下对话，提取知识点：\n\n${conversationText}`

    // 调用 LLM 提取
    const rawResult = await chatCompletionJSON(context.env, {
      messages: [{ role: 'user', content: userMessage }],
      systemPrompt,
    })

    const extracted = parseExtractionResult(rawResult)

    // 将提取结果映射到完整的 KnowledgePoint 对象（加上 label）
    const points: KnowledgePoint[] = extracted.flatMap(item => {
      const entry = KC_VOCABULARY.find(e => e.concept === item.concept && e.subject === subject)
      if (!entry) return []  // 过滤掉不在词汇表中的概念
      return [{
        concept: entry.concept,
        subject: entry.subject,
        label: entry.label,
        signal: item.signal,
      }]
    })

    // 持久化到 D1（fire-and-forget，不阻塞响应）
    const db = context.env.DB
    if (db && points.length > 0) {
      context.waitUntil(
        Promise.all(
          points.map(p => upsertKnowledgePoint(db, userId, p).catch(err =>
            console.error('[extract-knowledge D1 写入失败]', p.concept, err)
          ))
        )
      )
    }

    return jsonResponse({ points })
  } catch (err) {
    const message = err instanceof Error ? err.message : '知识点提取失败'
    console.error('[extract-knowledge]', message)
    return errorResponse(message)
  }
}
