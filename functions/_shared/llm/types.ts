export type LlmRole = 'user' | 'assistant'

export interface LlmMessage {
  role: LlmRole
  content: string
}

export interface LlmUntrustedContext {
  id: string
  label: string
  trust: 'untrusted'
  content: string
  metadata?: Record<string, unknown>
}

export interface LlmGenerationOptions {
  maxTokens?: number
  temperature?: number
  thinking?: 'disabled' | 'enabled'
}

export interface LlmRequest {
  systemPrompt: string
  messages: LlmMessage[]
  untrustedContexts?: LlmUntrustedContext[]
  generation?: LlmGenerationOptions
  metadata?: Record<string, unknown>
}

export interface LlmUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export type LlmFinishReason = 'stop' | 'length' | 'content_filter' | 'tool_call' | 'unknown'

export interface LlmProviderCompleteResult {
  text: string
  model: string
  requestId?: string
  usage?: LlmUsage
  finishReason?: LlmFinishReason
}

export type LlmStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; usage: LlmUsage }
  | { type: 'done'; finishReason: LlmFinishReason; usage?: LlmUsage; requestId?: string }

export interface LlmProviderStreamResult {
  stream: ReadableStream<LlmStreamEvent>
  model: string
  requestId?: string
}

export interface LlmProviderCallOptions {
  signal: AbortSignal
}

export interface LlmProvider {
  readonly id: string
  complete(request: LlmRequest, options: LlmProviderCallOptions): Promise<LlmProviderCompleteResult>
  stream(request: LlmRequest, options: LlmProviderCallOptions): Promise<LlmProviderStreamResult>
}

export type LlmErrorCode =
  | 'LLM_CONFIGURATION'
  | 'LLM_TIMEOUT'
  | 'LLM_ABORTED'
  | 'LLM_HTTP'
  | 'LLM_TRANSPORT'
  | 'LLM_MALFORMED_RESPONSE'
  | 'LLM_EMPTY_RESPONSE'
  | 'LLM_PROVIDER_ERROR'

export interface LlmErrorMetadata {
  code: LlmErrorCode
  message: string
  retryable: boolean
  status?: number
}

export interface LlmCallMetadata {
  providerId: string
  model: string
  mode: 'complete' | 'stream'
  startedAt: string
  durationMs: number
  timeoutMs: number
  timedOut: boolean
  requestId?: string
  finishReason?: LlmFinishReason
  usage?: LlmUsage
  error?: LlmErrorMetadata
}

export interface LlmCompletion {
  text: string
  metadata: LlmCallMetadata
}

export interface LlmStreamHandle {
  stream: ReadableStream<LlmStreamEvent>
  metadata: Promise<LlmCallMetadata>
}

export interface CollectedLlmStream {
  text: string
  metadata: LlmCallMetadata
}
