import { sanitizeUntrustedText } from '../input-safety'

export interface EmbeddingUsage {
  inputTexts: number
  inputCharacters: number
}

export interface EmbeddingBatch {
  vectors: number[][]
  providerId: string
  model: string
  dimension: number
  usage: EmbeddingUsage
}

export interface EmbeddingProviderStatus {
  state: 'ready' | 'disabled' | 'degraded'
  detail: string
}

export interface EmbeddingProvider {
  readonly id: string
  readonly model: string
  readonly dimension: number
  status(): EmbeddingProviderStatus
  embedDocuments(texts: string[], signal?: AbortSignal): Promise<EmbeddingBatch>
  embedQuery(text: string, signal?: AbortSignal): Promise<EmbeddingBatch>
}

export class EmbeddingProviderError extends Error {
  readonly code: 'EMBEDDING_DISABLED' | 'EMBEDDING_FAILED' | 'EMBEDDING_ABORTED'
  readonly retryable: boolean

  constructor(
    code: 'EMBEDDING_DISABLED' | 'EMBEDDING_FAILED' | 'EMBEDDING_ABORTED',
    message: string,
    retryable: boolean,
  ) {
    super(message)
    this.name = 'EmbeddingProviderError'
    this.code = code
    this.retryable = retryable
  }
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function tokens(value: string): string[] {
  const normalized = value.normalize('NFKC').toLowerCase()
  const result: string[] = normalized.match(/[a-z0-9]+|[\p{Script=Han}]/gu) ?? []
  const han = result.filter(token => /\p{Script=Han}/u.test(token))
  for (let index = 0; index < han.length - 1; index += 1) {
    result.push(`${han[index]}${han[index + 1]}`)
  }
  return result
}

function normalizedVector(value: string, dimension: number): number[] {
  const vector = Array.from({ length: dimension }, () => 0)
  for (const token of tokens(value)) {
    const hash = fnv1a(token)
    const index = hash % dimension
    const sign = (hash & 0x80000000) === 0 ? 1 : -1
    vector[index] += sign
  }
  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0))
  return magnitude === 0 ? vector : vector.map(item => item / magnitude)
}

export interface DeterministicFakeEmbeddingOptions {
  dimension?: number
  fail?: boolean
}

export class DeterministicFakeEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'deterministic-fake-embedding'
  readonly model = 'hash-bow-v1'
  readonly dimension: number
  private readonly fail: boolean

  constructor(options: DeterministicFakeEmbeddingOptions = {}) {
    this.dimension = options.dimension ?? 256
    this.fail = options.fail === true
    if (!Number.isInteger(this.dimension) || this.dimension < 16) {
      throw new EmbeddingProviderError('EMBEDDING_FAILED', 'fake embedding dimension must be >= 16', false)
    }
  }

  status(): EmbeddingProviderStatus {
    return this.fail
      ? { state: 'degraded', detail: 'Synthetic failure mode is enabled.' }
      : { state: 'ready', detail: 'Deterministic synthetic embedding; not a production model.' }
  }

  embedDocuments(texts: string[], signal?: AbortSignal): Promise<EmbeddingBatch> {
    return this.embed(texts, signal)
  }

  embedQuery(text: string, signal?: AbortSignal): Promise<EmbeddingBatch> {
    return this.embed([text], signal)
  }

  private async embed(texts: string[], signal?: AbortSignal): Promise<EmbeddingBatch> {
    if (signal?.aborted) {
      throw new EmbeddingProviderError('EMBEDDING_ABORTED', 'embedding request aborted', true)
    }
    if (this.fail) {
      throw new EmbeddingProviderError('EMBEDDING_FAILED', 'synthetic embedding provider failure', true)
    }
    const safeTexts = texts.map(text => sanitizeUntrustedText(text, { maxLength: 20_000 }).text)
    return {
      vectors: safeTexts.map(text => normalizedVector(text, this.dimension)),
      providerId: this.id,
      model: this.model,
      dimension: this.dimension,
      usage: {
        inputTexts: safeTexts.length,
        inputCharacters: safeTexts.reduce((sum, text) => sum + text.length, 0),
      },
    }
  }
}
