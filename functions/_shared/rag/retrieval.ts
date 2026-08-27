import { sanitizeUntrustedText } from '../input-safety'
import type { EmbeddingProvider } from './embedding'
import type { RagCitation, TextbookChunk, TextbookFilters } from './types'
import type { VectorStore } from './vector-store'

export interface RagServiceStatus {
  state: 'ready' | 'disabled' | 'degraded'
  detail: string
  embeddingProvider: string
  vectorStore: string
}

export interface RagRetrievalOptions {
  topK?: number
  scoreThreshold?: number
  filters?: TextbookFilters
  contextCharBudget?: number
  contextTokenBudget?: number
  dedupeByContentHash?: boolean
}

export interface RagRetrievalMatch {
  rank: number
  score: number
  chunk: TextbookChunk
  excerpt: string
  excerptCharacters: number
  estimatedTokens: number
  truncated: boolean
  citation: RagCitation
}

export interface RagRetrievalResult {
  query: string
  sanitizedQuery: string
  querySafetyFlags: string[]
  filters: TextbookFilters
  matches: RagRetrievalMatch[]
  metadata: {
    embeddingProvider: string
    embeddingModel: string
    vectorStore: string
    requestedTopK: number
    scoreThreshold: number
    candidateCount: number
    deduplicatedCount: number
    omittedForBudget: number
    usedCharacters: number
    estimatedTokens: number
    truncated: boolean
  }
}

export function estimateTextTokens(value: string): number {
  const han = value.match(/\p{Script=Han}/gu)?.length ?? 0
  const nonHan = value.replace(/\p{Script=Han}/gu, ' ')
  const words = nonHan.match(/[\p{L}\p{N}]+|[^\s]/gu)?.length ?? 0
  return han + Math.ceil(words * 1.25)
}

function truncateToBudgets(value: string, charBudget: number, tokenBudget: number): string {
  if (value.length <= charBudget && estimateTextTokens(value) <= tokenBudget) return value
  let low = 0
  let high = Math.min(value.length, charBudget)
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (estimateTextTokens(value.slice(0, middle)) <= tokenBudget) low = middle
    else high = middle - 1
  }
  return value.slice(0, low).trimEnd()
}

function citationFor(chunk: TextbookChunk, index: number): RagCitation {
  return {
    citationId: `TB${index + 1}`,
    sourceId: chunk.sourceId,
    sourceTitle: chunk.sourceTitle,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    chapterId: chunk.chapterId,
    chapterTitle: chunk.chapterTitle,
    sectionId: chunk.sectionId,
    sectionTitle: chunk.sectionTitle,
    chunkId: chunk.id,
    contentHash: chunk.contentHash,
    locator: chunk.locator,
  }
}

export class RagRetrievalService {
  readonly embeddingProvider: EmbeddingProvider
  readonly vectorStore: VectorStore

  constructor(
    embeddingProvider: EmbeddingProvider,
    vectorStore: VectorStore,
  ) {
    this.embeddingProvider = embeddingProvider
    this.vectorStore = vectorStore
  }

  status(): RagServiceStatus {
    const embedding = this.embeddingProvider.status()
    const store = this.vectorStore.status()
    const state = embedding.state === 'disabled' || store.state === 'disabled'
      ? 'disabled'
      : embedding.state === 'degraded' || store.state === 'degraded'
        ? 'degraded'
        : 'ready'
    return {
      state,
      detail: `${embedding.detail} ${store.detail}`,
      embeddingProvider: this.embeddingProvider.id,
      vectorStore: this.vectorStore.id,
    }
  }

  async index(chunks: TextbookChunk[], signal?: AbortSignal): Promise<void> {
    const texts = chunks.map(chunk => {
      const sanitized = sanitizeUntrustedText(chunk.content, { maxLength: 20_000 })
      return `${chunk.chapterTitle}\n${chunk.sectionTitle}\n${sanitized.text}`
    })
    const embedded = await this.embeddingProvider.embedDocuments(texts, signal)
    if (embedded.dimension !== this.vectorStore.dimension) {
      throw new Error(`embedding/store dimension mismatch: ${embedded.dimension}/${this.vectorStore.dimension}`)
    }
    await this.vectorStore.upsert(chunks.map((chunk, index) => ({
      id: chunk.id,
      vector: embedded.vectors[index],
      chunk,
    })))
  }

  async retrieve(
    query: string,
    options: RagRetrievalOptions = {},
    signal?: AbortSignal,
  ): Promise<RagRetrievalResult> {
    const topK = Math.max(1, Math.min(20, options.topK ?? 5))
    const scoreThreshold = options.scoreThreshold ?? 0.12
    const contextCharBudget = Math.max(1, options.contextCharBudget ?? 6_000)
    const contextTokenBudget = Math.max(1, options.contextTokenBudget ?? 1_500)
    const filters = options.filters ?? {}
    const safeQuery = sanitizeUntrustedText(query, { maxLength: 2_000 })
    const embedded = await this.embeddingProvider.embedQuery(safeQuery.text, signal)
    const vector = embedded.vectors[0]
    const candidates = await this.vectorStore.query(vector, {
      topK: Math.min(80, topK * 8),
      filters,
    })
    const aboveThreshold = candidates.filter(match => match.score >= scoreThreshold)
    const dedupe = options.dedupeByContentHash !== false
    const seen = new Set<string>()
    const deduplicated = aboveThreshold.filter(match => {
      const key = dedupe ? match.chunk.contentHash : match.chunk.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const unique = deduplicated.slice(0, topK)

    const matches: RagRetrievalMatch[] = []
    let usedCharacters = 0
    let usedTokens = 0
    let omittedForBudget = 0
    let anyTruncated = false
    for (const item of unique) {
      const remainingCharacters = contextCharBudget - usedCharacters
      const remainingTokens = contextTokenBudget - usedTokens
      if (remainingCharacters <= 0 || remainingTokens <= 0) {
        omittedForBudget += 1
        continue
      }
      const excerpt = truncateToBudgets(item.chunk.content, remainingCharacters, remainingTokens)
      if (!excerpt) {
        omittedForBudget += 1
        continue
      }
      const estimatedTokens = estimateTextTokens(excerpt)
      const truncated = excerpt.length < item.chunk.content.length
      anyTruncated ||= truncated
      const rank = matches.length + 1
      matches.push({
        rank,
        score: Math.round(item.score * 1_000_000) / 1_000_000,
        chunk: item.chunk,
        excerpt,
        excerptCharacters: excerpt.length,
        estimatedTokens,
        truncated,
        citation: citationFor(item.chunk, rank - 1),
      })
      usedCharacters += excerpt.length
      usedTokens += estimatedTokens
    }

    return {
      query,
      sanitizedQuery: safeQuery.text,
      querySafetyFlags: safeQuery.flags,
      filters,
      matches,
      metadata: {
        embeddingProvider: embedded.providerId,
        embeddingModel: embedded.model,
        vectorStore: this.vectorStore.id,
        requestedTopK: topK,
        scoreThreshold,
        candidateCount: candidates.length,
        deduplicatedCount: aboveThreshold.length - deduplicated.length,
        omittedForBudget,
        usedCharacters,
        estimatedTokens: usedTokens,
        truncated: anyTruncated || omittedForBudget > 0,
      },
    }
  }
}
