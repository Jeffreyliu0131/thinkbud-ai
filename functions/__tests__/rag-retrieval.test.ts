import { beforeEach, describe, expect, it } from 'vitest'
import { buildRagContext } from '../_shared/rag/context-builder'
import { DeterministicFakeEmbeddingProvider, EmbeddingProviderError } from '../_shared/rag/embedding'
import { ingestTextbook } from '../_shared/rag/ingestion'
import { RagRetrievalService } from '../_shared/rag/retrieval'
import type { TextbookChunk } from '../_shared/rag/types'
import { InMemoryVectorStore, VectorStoreError } from '../_shared/rag/vector-store'
import { CloudflareVectorizeStore } from '../_shared/rag/vectorize'

let chunks: TextbookChunk[]
let embedding: DeterministicFakeEmbeddingProvider
let service: RagRetrievalService

beforeEach(async () => {
  const upper = await ingestTextbook({
    source: {
      title: 'Upper Math', grade: { min: 4, max: 6, label: 'upper' }, subject: 'math', version: '1',
    },
    document: {
      title: 'Upper Math', format: 'markdown',
      content: '# Fractions\n## Denominators\nUse a common denominator and combine numerators.\n## Benchmarks\nCompare a fraction with one half before calculating.',
    },
    chunking: { maxChars: 160, overlapChars: 16 },
  })
  const lower = await ingestTextbook({
    source: {
      title: 'Lower Math', grade: { min: 1, max: 3, label: 'lower' }, subject: 'math', version: '1',
    },
    document: { title: 'Lower Math', format: 'text', content: 'Place value uses tens and ones.' },
  })
  chunks = [...upper.chunks, ...lower.chunks]
  embedding = new DeterministicFakeEmbeddingProvider({ dimension: 128 })
  service = new RagRetrievalService(embedding, new InMemoryVectorStore(128))
  await service.index(chunks)
})

describe('RAG retrieval', () => {
  it('returns stable ranking and complete structured citations', async () => {
    const options = { topK: 2, scoreThreshold: -1, filters: { subject: 'math', gradeLabel: 'upper' } }
    const first = await service.retrieve('common denominator combine numerators', options)
    const second = await service.retrieve('common denominator combine numerators', options)

    expect(first.matches.map(match => match.chunk.id)).toEqual(second.matches.map(match => match.chunk.id))
    expect(first.matches[0].chunk.sectionTitle).toBe('Denominators')
    expect(first.matches[0].citation).toMatchObject({
      citationId: 'TB1',
      chunkId: first.matches[0].chunk.id,
      sectionTitle: 'Denominators',
      contentHash: first.matches[0].chunk.contentHash,
    })
  })

  it('enforces subject, grade, source, and threshold filters', async () => {
    const upper = await service.retrieve('place value tens ones', {
      topK: 5, scoreThreshold: -1, filters: { gradeLabel: 'upper' },
    })
    const unknownSource = await service.retrieve('common denominator', {
      topK: 5, scoreThreshold: -1, filters: { sourceIds: ['src_missing'] },
    })
    const tooHigh = await service.retrieve('common denominator', { topK: 5, scoreThreshold: 1.01 })

    expect(upper.matches.every(match => match.chunk.grade.label === 'upper')).toBe(true)
    expect(unknownSource.matches).toHaveLength(0)
    expect(tooHigh.matches).toHaveLength(0)
  })

  it('deduplicates duplicate content hashes before top-k', async () => {
    const duplicate = { ...structuredClone(chunks[0]), id: 'chk_duplicate_for_test' }
    const duplicateService = new RagRetrievalService(embedding, new InMemoryVectorStore(128))
    await duplicateService.index([...chunks, duplicate])
    const result = await duplicateService.retrieve('common denominator combine numerators', {
      topK: 10, scoreThreshold: -1,
    })
    const hashes = result.matches.map(match => match.chunk.contentHash)

    expect(new Set(hashes).size).toBe(hashes.length)
    expect(result.metadata.deduplicatedCount).toBeGreaterThan(0)
  })

  it('honors character/token budgets and reports truncation', async () => {
    const result = await service.retrieve('common denominator combine numerators', {
      topK: 2, scoreThreshold: -1, contextCharBudget: 24, contextTokenBudget: 8,
    })

    expect(result.metadata.usedCharacters).toBeLessThanOrEqual(24)
    expect(result.metadata.estimatedTokens).toBeLessThanOrEqual(8)
    expect(result.metadata.truncated).toBe(true)
    expect(buildRagContext(result, { maxCharacters: 1_500, maxTokens: 300 }).truncated).toBe(true)
  })

  it('surfaces store and provider failures for the chat layer to degrade safely', async () => {
    const storeFailure = new RagRetrievalService(embedding, new InMemoryVectorStore(128, { failQuery: true }))
    const providerFailure = new RagRetrievalService(
      new DeterministicFakeEmbeddingProvider({ dimension: 128, fail: true }),
      new InMemoryVectorStore(128),
    )

    await expect(storeFailure.retrieve('query')).rejects.toBeInstanceOf(VectorStoreError)
    await expect(providerFailure.retrieve('query')).rejects.toBeInstanceOf(EmbeddingProviderError)
  })

  it('reports Vectorize as disabled without a binding and degraded without deployment attestation', async () => {
    const missing = new CloudflareVectorizeStore({ indexName: 'textbooks', dimension: 128 })
    const binding = {
      upsert: async () => undefined,
      query: async () => ({ matches: [] }),
    }
    const unattested = new CloudflareVectorizeStore({ indexName: 'textbooks', dimension: 128, binding })

    expect(missing.status().state).toBe('disabled')
    expect(unattested.status().state).toBe('degraded')
    await expect(missing.query(Array.from({ length: 128 }, () => 0), { topK: 1 }))
      .rejects.toMatchObject({ code: 'VECTOR_STORE_DISABLED' })
  })
})
