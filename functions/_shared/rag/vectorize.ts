import { chunkMatchesFilters, VectorStoreError } from './vector-store'
import type { VectorMatch, VectorQueryOptions, VectorRecord, VectorStore, VectorStoreStatus } from './vector-store'

export interface CloudflareVectorizeVector {
  id: string
  values: number[]
  metadata?: Record<string, string | number | boolean>
}

export interface CloudflareVectorizeQueryMatch {
  id: string
  score: number
  metadata?: Record<string, string | number | boolean>
}

export interface CloudflareVectorizeBinding {
  upsert(vectors: CloudflareVectorizeVector[]): Promise<unknown>
  query(
    vector: number[],
    options: { topK: number; returnMetadata: 'all' },
  ): Promise<{ matches: CloudflareVectorizeQueryMatch[] }>
}

export interface CloudflareVectorizeStoreOptions {
  binding?: CloudflareVectorizeBinding
  indexName: string
  dimension: number
  deploymentAttested?: boolean
}

/**
 * Adapter contract only. A binding, matching dimension, embedding provider,
 * durable ingestion job, and production source attestation are all required
 * before this can be described as configured or deployed.
 */
export class CloudflareVectorizeStore implements VectorStore {
  readonly id: string
  readonly dimension: number
  private readonly binding?: CloudflareVectorizeBinding
  private readonly deploymentAttested: boolean

  constructor(options: CloudflareVectorizeStoreOptions) {
    this.id = `cloudflare-vectorize:${options.indexName}`
    this.dimension = options.dimension
    this.binding = options.binding
    this.deploymentAttested = options.deploymentAttested === true
  }

  status(): VectorStoreStatus {
    if (!this.binding) {
      return { state: 'disabled', detail: 'TEXTBOOK_VECTORIZE binding is missing.', adapter: this.id }
    }
    return this.deploymentAttested
      ? { state: 'ready', detail: 'Binding and deployment attestation are present; source/index evidence still belongs to the release manifest.', adapter: this.id }
      : { state: 'degraded', detail: 'Binding is present, but index deployment/content is not attested.', adapter: this.id }
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    const binding = this.requireBinding()
    try {
      await binding.upsert(records.map(record => {
        if (record.vector.length !== this.dimension) {
          throw new VectorStoreError('VECTOR_DIMENSION_MISMATCH', `expected dimension ${this.dimension}`, false)
        }
        return {
          id: record.id,
          values: record.vector,
          metadata: { chunkJson: JSON.stringify(record.chunk) },
        }
      }))
    } catch (error) {
      if (error instanceof VectorStoreError) throw error
      throw new VectorStoreError('VECTOR_STORE_FAILED', 'Vectorize upsert failed', true)
    }
  }

  async query(vector: number[], options: VectorQueryOptions): Promise<VectorMatch[]> {
    const binding = this.requireBinding()
    if (vector.length !== this.dimension) {
      throw new VectorStoreError('VECTOR_DIMENSION_MISMATCH', `expected dimension ${this.dimension}`, false)
    }
    try {
      const result = await binding.query(vector, {
        topK: Math.max(options.topK, options.topK * 4),
        returnMetadata: 'all',
      })
      return result.matches.flatMap(match => {
        const serialized = match.metadata?.chunkJson
        if (typeof serialized !== 'string') return []
        try {
          const chunk = JSON.parse(serialized) as VectorMatch['chunk']
          return chunkMatchesFilters(chunk, options.filters) ? [{ score: match.score, chunk }] : []
        } catch {
          return []
        }
      }).sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id))
        .slice(0, options.topK)
    } catch (error) {
      if (error instanceof VectorStoreError) throw error
      throw new VectorStoreError('VECTOR_STORE_FAILED', 'Vectorize query failed', true)
    }
  }

  private requireBinding(): CloudflareVectorizeBinding {
    if (!this.binding) {
      throw new VectorStoreError('VECTOR_STORE_DISABLED', 'TEXTBOOK_VECTORIZE binding is missing', false)
    }
    return this.binding
  }
}

export const TEXTBOOK_VECTORIZE_SCHEMA = {
  binding: 'TEXTBOOK_VECTORIZE',
  metric: 'cosine',
  metadata: {
    chunkJson: 'Serialized TextbookChunk for adapter-only prototype; production should use a durable chunk repository.',
  },
} as const
