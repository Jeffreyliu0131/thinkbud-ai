import type { LlmUntrustedContext } from '../llm/types'
import { buildRagContext } from './context-builder'
import type { RagRetrievalService } from './retrieval'
import type { RagCitation } from './types'
import type { CloudflareVectorizeBinding } from './vectorize'

export interface RagRuntimeEnv {
  RAG_TEXTBOOK_ENABLED?: string
  RAG_TOP_K?: string
  RAG_SCORE_THRESHOLD?: string
  RAG_CONTEXT_CHAR_BUDGET?: string
  RAG_CONTEXT_TOKEN_BUDGET?: string
  RAG_SERVICE?: RagRetrievalService
  TEXTBOOK_VECTORIZE?: CloudflareVectorizeBinding
}

export type ChatRagStatus = 'disabled' | 'degraded' | 'no_results' | 'used'

export interface ChatRagRequest {
  query: string
  subject: string
  gradeLabel: 'lower' | 'upper'
}

export interface ChatRagResult {
  status: ChatRagStatus
  reason: string
  context?: LlmUntrustedContext
  citations: RagCitation[]
  truncated: boolean
}

function numberSetting(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

/**
 * The endpoint remains non-RAG unless both the explicit flag and a complete
 * service are present. RAG failures never replace or bypass the original chat.
 */
export async function buildChatRagContext(
  env: RagRuntimeEnv,
  request: ChatRagRequest,
): Promise<ChatRagResult> {
  if (env.RAG_TEXTBOOK_ENABLED !== 'true') {
    return { status: 'disabled', reason: 'RAG_TEXTBOOK_ENABLED is not true.', citations: [], truncated: false }
  }
  if (!env.RAG_SERVICE) {
    const bindingDetail = env.TEXTBOOK_VECTORIZE
      ? 'Vectorize binding is present, but embedding/index bootstrap is unconfigured.'
      : 'RAG service and TEXTBOOK_VECTORIZE binding are missing.'
    return { status: 'degraded', reason: bindingDetail, citations: [], truncated: false }
  }
  const serviceStatus = env.RAG_SERVICE.status()
  if (serviceStatus.state !== 'ready') {
    return { status: 'degraded', reason: serviceStatus.detail, citations: [], truncated: false }
  }

  try {
    const charBudget = numberSetting(env.RAG_CONTEXT_CHAR_BUDGET, 6_000, 256, 12_000)
    const tokenBudget = numberSetting(env.RAG_CONTEXT_TOKEN_BUDGET, 1_500, 64, 3_000)
    const retrieval = await env.RAG_SERVICE.retrieve(request.query, {
      topK: numberSetting(env.RAG_TOP_K, 5, 1, 10),
      scoreThreshold: numberSetting(env.RAG_SCORE_THRESHOLD, 0.12, -1, 1),
      filters: { subject: request.subject, gradeLabel: request.gradeLabel },
      contextCharBudget: charBudget,
      contextTokenBudget: tokenBudget,
    })
    if (retrieval.matches.length === 0) {
      return { status: 'no_results', reason: 'No matching textbook chunks met filters and threshold.', citations: [], truncated: false }
    }
    const context = buildRagContext(retrieval, {
      maxCharacters: charBudget,
      maxTokens: tokenBudget,
    })
    if (!context.text || context.citations.length === 0) {
      return { status: 'no_results', reason: 'Retrieved chunks did not fit the configured context budget.', citations: [], truncated: true }
    }
    return {
      status: 'used',
      reason: 'Synthetic/backend RAG context attached as an untrusted field.',
      context: {
        id: 'textbook-rag-v1',
        label: 'textbook_retrieval',
        trust: 'untrusted',
        content: context.text,
        metadata: {
          excerptBoundary: context.excerptBoundary,
          citations: context.citations,
          truncated: context.truncated,
          omittedCitations: context.omittedCitations,
          safetyFlags: context.safetyFlags,
        },
      },
      citations: context.citations,
      truncated: context.truncated,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown RAG failure'
    return { status: 'degraded', reason, citations: [], truncated: false }
  }
}
