import type { TextbookChunk, TextbookFilters } from './types'

export interface VectorStoreStatus {
  state: 'ready' | 'disabled' | 'degraded'
  detail: string
  adapter: string
}

export interface VectorRecord {
  id: string
  vector: number[]
  chunk: TextbookChunk
}

export interface VectorQueryOptions {
  topK: number
  filters?: TextbookFilters
}

export interface VectorMatch {
  score: number
  chunk: TextbookChunk
}

export interface VectorStore {
  readonly id: string
  readonly dimension: number
  status(): VectorStoreStatus
  upsert(records: VectorRecord[]): Promise<void>
  query(vector: number[], options: VectorQueryOptions): Promise<VectorMatch[]>
}

export class VectorStoreError extends Error {
  readonly code: 'VECTOR_STORE_DISABLED' | 'VECTOR_STORE_FAILED' | 'VECTOR_DIMENSION_MISMATCH'
  readonly retryable: boolean

  constructor(
    code: 'VECTOR_STORE_DISABLED' | 'VECTOR_STORE_FAILED' | 'VECTOR_DIMENSION_MISMATCH',
    message: string,
    retryable: boolean,
  ) {
    super(message)
    this.name = 'VectorStoreError'
    this.code = code
    this.retryable = retryable
  }
}

export function chunkMatchesFilters(chunk: TextbookChunk, filters?: TextbookFilters): boolean {
  if (!filters) return true
  if (filters.subject && chunk.subject !== filters.subject.toLowerCase()) return false
  if (filters.grade !== undefined && (filters.grade < chunk.grade.min || filters.grade > chunk.grade.max)) return false
  if (filters.gradeLabel && chunk.grade.label !== filters.gradeLabel) return false
  if (filters.sourceIds && !filters.sourceIds.includes(chunk.sourceId)) return false
  return true
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new VectorStoreError('VECTOR_DIMENSION_MISMATCH', 'query and record dimensions differ', false)
  }
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftMagnitude += left[index] * left[index]
    rightMagnitude += right[index] * right[index]
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0
  return dot / Math.sqrt(leftMagnitude * rightMagnitude)
}

export interface InMemoryVectorStoreOptions {
  failUpsert?: boolean
  failQuery?: boolean
}

export class InMemoryVectorStore implements VectorStore {
  readonly id = 'in-memory-vector-store'
  readonly dimension: number
  private readonly records = new Map<string, VectorRecord>()
  private readonly failUpsert: boolean
  private readonly failQuery: boolean

  constructor(dimension: number, options: InMemoryVectorStoreOptions = {}) {
    this.dimension = dimension
    this.failUpsert = options.failUpsert === true
    this.failQuery = options.failQuery === true
  }

  status(): VectorStoreStatus {
    if (this.failUpsert || this.failQuery) {
      return { state: 'degraded', detail: 'Synthetic failure mode is enabled.', adapter: this.id }
    }
    return { state: 'ready', detail: 'Process-local test store; data is not durable.', adapter: this.id }
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (this.failUpsert) {
      throw new VectorStoreError('VECTOR_STORE_FAILED', 'synthetic vector upsert failure', true)
    }
    for (const record of records) {
      if (record.vector.length !== this.dimension) {
        throw new VectorStoreError('VECTOR_DIMENSION_MISMATCH', `expected dimension ${this.dimension}`, false)
      }
      this.records.set(record.id, {
        ...record,
        vector: [...record.vector],
        chunk: structuredClone(record.chunk),
      })
    }
  }

  async query(vector: number[], options: VectorQueryOptions): Promise<VectorMatch[]> {
    if (this.failQuery) {
      throw new VectorStoreError('VECTOR_STORE_FAILED', 'synthetic vector query failure', true)
    }
    if (vector.length !== this.dimension) {
      throw new VectorStoreError('VECTOR_DIMENSION_MISMATCH', `expected dimension ${this.dimension}`, false)
    }
    return [...this.records.values()]
      .filter(record => chunkMatchesFilters(record.chunk, options.filters))
      .map(record => ({ score: cosineSimilarity(vector, record.vector), chunk: structuredClone(record.chunk) }))
      .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id))
      .slice(0, Math.max(0, options.topK))
  }
}
