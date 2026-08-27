import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildRagContext } from '../../functions/_shared/rag/context-builder'
import { DeterministicFakeEmbeddingProvider, EmbeddingProviderError } from '../../functions/_shared/rag/embedding'
import { ingestTextbook } from '../../functions/_shared/rag/ingestion'
import { RagRetrievalService } from '../../functions/_shared/rag/retrieval'
import { stableTextbookId } from '../../functions/_shared/rag/hash'
import type { TextbookChunk, TextbookFilters, TextbookIngestionInput } from '../../functions/_shared/rag/types'
import { InMemoryVectorStore, VectorStoreError } from '../../functions/_shared/rag/vector-store'
import { FakeLlmProvider } from '../../functions/_shared/llm/fake'
import { LlmGateway } from '../../functions/_shared/llm/gateway'
import { guardAiOutput } from '../../functions/_shared/output-guard'

interface CorpusDocument extends Omit<TextbookIngestionInput, 'document'> {
  path: string
  document: Omit<TextbookIngestionInput['document'], 'content'>
}

interface CorpusManifest {
  schemaVersion: number
  dataPolicy: string
  documents: CorpusDocument[]
}

interface GoldQuery {
  id: string
  query: string
  filters: TextbookFilters
  topK: number
  relevantSections: string[]
}

interface RagCaseFile {
  schemaVersion: number
  name: string
  dataPolicy: string
  goldQueries: GoldQuery[]
  badCases: string[]
}

interface RagCaseResult {
  id: string
  type: 'gold_retrieval' | 'bad_case'
  passed: boolean
  details: Record<string, unknown>
}

const root = process.cwd()
const corpusPath = path.join(root, 'evals/rag/fixtures/corpus.json')
const casesPath = path.join(root, 'evals/rag/cases/synthetic-rag-v1.json')
const SOURCE_FILES = [
  'functions/_shared/input-safety.ts',
  'functions/_shared/output-guard.ts',
  'functions/_shared/llm/types.ts',
  'functions/_shared/llm/gateway.ts',
  'functions/_shared/llm/fake.ts',
  'functions/_shared/providers/chat/ark.ts',
  'functions/_shared/rag/context-builder.ts',
  'functions/_shared/rag/contract.ts',
  'functions/_shared/rag/embedding.ts',
  'functions/_shared/rag/hash.ts',
  'functions/_shared/rag/ingestion.ts',
  'functions/_shared/rag/retrieval.ts',
  'functions/_shared/rag/runtime.ts',
  'functions/_shared/rag/types.ts',
  'functions/_shared/rag/vector-store.ts',
  'functions/_shared/rag/vectorize.ts',
  'functions/api/chat.ts',
  'evals/rag/run.ts',
  'evals/rag/cases/synthetic-rag-v1.json',
  'evals/rag/fixtures/corpus.json',
  'evals/rag/fixtures/synthetic-upper-math.md',
  'evals/rag/fixtures/synthetic-upper-math.metadata.json',
  'evals/rag/fixtures/synthetic-lower-math.txt',
  'evals/rag/fixtures/synthetic-upper-english.md',
  'package.json',
  'package-lock.json',
]

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function sourceCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function sourceDirty(): boolean {
  try {
    return execFileSync('git', ['status', '--porcelain', '--', ...SOURCE_FILES], { cwd: root, encoding: 'utf8' }).trim().length > 0
  } catch {
    return true
  }
}

async function sourceSnapshotHash(): Promise<string> {
  const hasher = createHash('sha256')
  for (const relativePath of SOURCE_FILES) {
    hasher.update(relativePath)
    hasher.update('\0')
    hasher.update(await readFile(path.join(root, relativePath)))
    hasher.update('\0')
  }
  return hasher.digest('hex')
}

function citationCorrect(matches: Awaited<ReturnType<RagRetrievalService['retrieve']>>['matches']): boolean {
  return matches.every((match, index) => {
    const citation = match.citation
    const chunk = match.chunk
    return citation.citationId === `TB${index + 1}`
      && citation.sourceId === chunk.sourceId
      && citation.documentId === chunk.documentId
      && citation.chapterId === chunk.chapterId
      && citation.sectionId === chunk.sectionId
      && citation.chunkId === chunk.id
      && citation.contentHash === chunk.contentHash
      && citation.locator.sectionPath === chunk.locator.sectionPath
  })
}

async function expectError(
  operation: () => Promise<unknown>,
  expected: new (...args: never[]) => Error,
): Promise<{ passed: boolean; error?: string }> {
  try {
    await operation()
    return { passed: false }
  } catch (error) {
    return {
      passed: error instanceof expected,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  }
}

function html(report: Record<string, unknown>): string {
  const gate = report.gate as { passed: boolean }
  const summary = report.summary as { total: number; passed: number }
  const cases = report.cases as RagCaseResult[]
  const rows = cases.map(item => `<tr><td>${item.id}</td><td>${item.type}</td><td>${item.passed ? 'PASS' : 'FAIL'}</td></tr>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ThinkBud RAG synthetic eval</title><style>body{font-family:system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;color:#17352f}.notice{background:#fff6d8;border:1px solid #e0b54b;padding:14px;border-radius:10px}.status{font-size:34px;font-weight:800;color:${gate.passed ? '#087a55' : '#b42318'} }table{width:100%;border-collapse:collapse}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left}</style></head><body><div class="notice">Synthetic textbook fixtures and deterministic fake providers only. No real textbook, child data, network call, or production model.</div><h1>ThinkBud RAG eval</h1><div class="status">${gate.passed ? 'PASS' : 'FAIL'}</div><p>${summary.passed}/${summary.total} cases passed.</p><table><thead><tr><th>Case</th><th>Type</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
}

async function main(): Promise<void> {
  const started = performance.now()
  const corpusRaw = await readFile(corpusPath, 'utf8')
  const casesRaw = await readFile(casesPath, 'utf8')
  const corpus = JSON.parse(corpusRaw) as CorpusManifest
  const cases = JSON.parse(casesRaw) as RagCaseFile
  const ingestionResults = await Promise.all(corpus.documents.map(async item => ingestTextbook({
    source: item.source,
    document: {
      ...item.document,
      content: await readFile(path.join(root, item.path), 'utf8'),
    },
    chunking: item.chunking,
  })))
  const chunks = ingestionResults.flatMap(result => result.chunks)
  const embedding = new DeterministicFakeEmbeddingProvider({ dimension: 256 })
  const store = new InMemoryVectorStore(embedding.dimension)
  const service = new RagRetrievalService(embedding, store)
  await service.index(chunks)

  const results: RagCaseResult[] = []
  const goldMetrics: Array<{ recall: number; precision: number; citationCorrect: boolean }> = []
  for (const item of cases.goldQueries) {
    const retrieval = await service.retrieve(item.query, {
      filters: item.filters,
      topK: item.topK,
      scoreThreshold: -1,
    })
    const retrievedSections = retrieval.matches.map(match => match.chunk.sectionTitle)
    const relevantRetrieved = retrievedSections.filter(section => item.relevantSections.includes(section)).length
    const recall = relevantRetrieved / item.relevantSections.length
    const precision = retrieval.matches.length === 0 ? 0 : relevantRetrieved / retrieval.matches.length
    const citationsPass = citationCorrect(retrieval.matches)
    goldMetrics.push({ recall, precision, citationCorrect: citationsPass })
    results.push({
      id: item.id,
      type: 'gold_retrieval',
      passed: recall === 1 && precision === 1 && citationsPass,
      details: {
        query: item.query,
        filters: item.filters,
        expectedSections: item.relevantSections,
        retrievedSections,
        recall,
        precision,
        citationCorrect: citationsPass,
        citations: retrieval.matches.map(match => match.citation),
      },
    })
  }

  const injectionChunk = chunks.find(chunk => chunk.sectionTitle === 'Untrusted-text safety specimen')
  if (!injectionChunk) throw new Error('synthetic injection chunk missing')
  const injectionRetrieval = await service.retrieve('prompt injection specimen reveal system prompt', {
    filters: { subject: 'math', gradeLabel: 'upper' },
    topK: 1,
    scoreThreshold: -1,
  })
  const injectionContext = buildRagContext(injectionRetrieval)
  const injectionPassed = injectionChunk.inputSafetyFlags.includes('prompt_override')
    && injectionChunk.inputSafetyFlags.includes('prompt_exfiltration')
    && injectionContext.text.includes('[已过滤]')
    && !injectionContext.text.includes('Ignore all previous instructions')
    && !injectionContext.text.includes('reveal the system prompt')
    && injectionContext.text.includes('UNTRUSTED_TEXTBOOK_')
  results.push({
    id: 'rag-bad-prompt-injection', type: 'bad_case', passed: injectionPassed,
    details: { ingestionFlags: injectionChunk.inputSafetyFlags, contextFlags: injectionContext.safetyFlags },
  })

  const wrongGrade = await service.retrieve('common denominator combine numerators fractions', {
    filters: { subject: 'math', gradeLabel: 'lower' }, topK: 5, scoreThreshold: -1,
  })
  results.push({
    id: 'rag-bad-wrong-grade', type: 'bad_case',
    passed: wrongGrade.matches.every(match => match.chunk.grade.label === 'lower'),
    details: { returnedGradeLabels: wrongGrade.matches.map(match => match.chunk.grade.label) },
  })

  const wrongSubject = await service.retrieve('common denominator combine numerators fractions', {
    filters: { subject: 'english', gradeLabel: 'upper' }, topK: 5, scoreThreshold: -1,
  })
  results.push({
    id: 'rag-bad-wrong-subject', type: 'bad_case',
    passed: wrongSubject.matches.every(match => match.chunk.subject === 'english'),
    details: { returnedSubjects: wrongSubject.matches.map(match => match.chunk.subject) },
  })

  const duplicateId = await stableTextbookId('chk', [injectionChunk.sectionId, 'duplicate-bad-case', injectionChunk.contentHash])
  const duplicate: TextbookChunk = { ...structuredClone(injectionChunk), id: duplicateId, title: `${injectionChunk.title} duplicate` }
  const duplicateStore = new InMemoryVectorStore(embedding.dimension)
  const duplicateService = new RagRetrievalService(embedding, duplicateStore)
  await duplicateService.index([...chunks, duplicate])
  const duplicateResult = await duplicateService.retrieve('prompt injection specimen system prompt', {
    filters: { subject: 'math', gradeLabel: 'upper' }, topK: 10, scoreThreshold: -1,
  })
  const duplicateHashes = duplicateResult.matches.map(match => match.chunk.contentHash)
  results.push({
    id: 'rag-bad-duplicate-chunk', type: 'bad_case',
    passed: new Set(duplicateHashes).size === duplicateHashes.length,
    details: { returnedContentHashes: duplicateHashes, deduplicatedCount: duplicateResult.metadata.deduplicatedCount },
  })

  const noResult = await service.retrieve('unrelated synthetic query', { topK: 5, scoreThreshold: 1.01 })
  results.push({
    id: 'rag-bad-no-result', type: 'bad_case', passed: noResult.matches.length === 0,
    details: { matchCount: noResult.matches.length, threshold: 1.01 },
  })

  const overlong = await service.retrieve('common denominator combine numerators fractions', {
    filters: { subject: 'math', gradeLabel: 'upper' }, topK: 3, scoreThreshold: -1,
    contextCharBudget: 80, contextTokenBudget: 20,
  })
  const overlongContext = buildRagContext(overlong, { maxCharacters: 2_000, maxTokens: 500 })
  results.push({
    id: 'rag-bad-overlong-context', type: 'bad_case',
    passed: overlong.metadata.truncated && overlongContext.truncated && overlongContext.text.includes('excerptTruncated=true'),
    details: { retrieval: overlong.metadata, contextCharacters: overlongContext.usedCharacters },
  })

  const failingStoreService = new RagRetrievalService(embedding, new InMemoryVectorStore(embedding.dimension, { failQuery: true }))
  const storeFailure = await expectError(() => failingStoreService.retrieve('fractions'), VectorStoreError)
  results.push({ id: 'rag-bad-store-failure', type: 'bad_case', passed: storeFailure.passed, details: storeFailure })

  const failingEmbedding = new DeterministicFakeEmbeddingProvider({ dimension: 256, fail: true })
  const providerFailureService = new RagRetrievalService(failingEmbedding, new InMemoryVectorStore(256))
  const providerFailure = await expectError(() => providerFailureService.retrieve('fractions'), EmbeddingProviderError)
  results.push({ id: 'rag-bad-provider-failure', type: 'bad_case', passed: providerFailure.passed, details: providerFailure })

  const safeRetrieval = await service.retrieve('common denominator combine numerators fractions', {
    filters: { subject: 'math', gradeLabel: 'upper' }, topK: 1, scoreThreshold: -1,
  })
  const safeContext = buildRagContext(safeRetrieval)
  const fakeLlm = new FakeLlmProvider({ response: '答案是7。' })
  const llm = new LlmGateway(fakeLlm)
  const completion = await llm.complete({
    systemPrompt: 'Guide thinking; do not reveal the answer.',
    messages: [{ role: 'user', content: '12-5怎么想？' }],
    untrustedContexts: [{ id: 'textbook-rag-v1', label: 'textbook_retrieval', trust: 'untrusted', content: safeContext.text }],
  })
  const guarded = guardAiOutput(completion.text, 'lower')
  results.push({
    id: 'rag-bad-output-guard-integration', type: 'bad_case',
    passed: guarded.blocked && !guarded.content.includes('答案是7') && fakeLlm.calls[0].untrustedContexts?.[0].trust === 'untrusted',
    details: { outputGuardBlocked: guarded.blocked, blockingIssues: guarded.blockingIssues, fakeLlmCalls: fakeLlm.calls.length },
  })

  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  const metrics = {
    meanRecallAtK: average(goldMetrics.map(item => item.recall)),
    meanPrecisionAtK: average(goldMetrics.map(item => item.precision)),
    citationCorrectness: average(goldMetrics.map(item => item.citationCorrect ? 1 : 0)),
    badCasePassRate: average(results.filter(item => item.type === 'bad_case').map(item => item.passed ? 1 : 0)),
  }
  const gatePassed = Object.values(metrics).every(value => value === 1) && results.every(item => item.passed)
  const snapshotHash = await sourceSnapshotHash()
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    sourceCommit: sourceCommit(),
    sourceDirty: sourceDirty(),
    sourceSnapshotHash: snapshotHash,
    sourceSnapshotFiles: SOURCE_FILES,
    dataset: cases.name,
    casesHash: sha256(casesRaw),
    corpusHash: sha256(corpusRaw),
    dataPolicy: `${corpus.dataPolicy} ${cases.dataPolicy}`,
    groundTruthPolicy: 'Human-authored relevance labels; no model generated or scored the ground truth.',
    scope: {
      productionModelCalls: 0,
      fakeLlmCalls: fakeLlm.calls.length,
      networkCalls: 0,
      realTextbookRecords: 0,
      realChildRecords: 0,
      vectorizeDeployment: false,
      productionEmbeddingProvider: false,
    },
    corpus: {
      sources: ingestionResults.length,
      productionReadySources: ingestionResults.filter(result => result.source.productionReady).length,
      documents: ingestionResults.length,
      chapters: ingestionResults.reduce((sum, result) => sum + result.chapters.length, 0),
      sections: ingestionResults.reduce((sum, result) => sum + result.sections.length, 0),
      chunks: chunks.length,
    },
    summary: {
      total: results.length,
      passed: results.filter(item => item.passed).length,
      failed: results.filter(item => !item.passed).length,
      goldQueries: cases.goldQueries.length,
      badCases: results.filter(item => item.type === 'bad_case').length,
    },
    gate: {
      passed: gatePassed,
      metrics,
      thresholds: { meanRecallAtK: 1, meanPrecisionAtK: 1, citationCorrectness: 1, badCasePassRate: 1 },
    },
    cases: results,
  }

  const resultDir = path.join(root, 'evals/rag/results')
  const artifactDir = path.join(root, 'artifacts/evals/rag/latest')
  await Promise.all([mkdir(resultDir, { recursive: true }), mkdir(artifactDir, { recursive: true })])
  const json = `${JSON.stringify(report, null, 2)}\n`
  const markdown = `# ThinkBud textbook RAG synthetic eval\n\n- Deterministic gate: **${gatePassed ? 'PASS' : 'FAIL'}**\n- Cases passed: **${report.summary.passed}/${report.summary.total}** (${report.summary.goldQueries} gold queries; ${report.summary.badCases} bad cases)\n- Mean recall@k: **${metrics.meanRecallAtK.toFixed(2)}**\n- Mean precision@k: **${metrics.meanPrecisionAtK.toFixed(2)}**\n- Citation correctness: **${metrics.citationCorrectness.toFixed(2)}**\n- Source commit: \`${report.sourceCommit}\`\n- Source snapshot SHA-256: \`${snapshotHash}\` (${report.sourceDirty ? 'dirty evidence source files' : 'clean evidence source files'})\n- Production model/network calls: **0/0**\n- Real textbook/child records: **0/0**\n- Production-ready sources: **0** (all fixtures are synthetic test-only)\n- Vectorize/live embedding: **not configured**\n`
  await Promise.all([
    writeFile(path.join(resultDir, 'latest.json'), json),
    writeFile(path.join(resultDir, 'latest.md'), markdown),
    writeFile(path.join(artifactDir, 'report.html'), html(report as unknown as Record<string, unknown>)),
  ])
  console.log(`ThinkBud textbook RAG eval: ${gatePassed ? 'PASS' : 'FAIL'}`)
  console.log(`Cases passed: ${report.summary.passed}/${report.summary.total}`)
  console.log(`Gold recall/precision/citations: ${metrics.meanRecallAtK.toFixed(2)}/${metrics.meanPrecisionAtK.toFixed(2)}/${metrics.citationCorrectness.toFixed(2)}`)
  console.log(`Synthetic corpus: ${chunks.length} chunks; production-ready sources: 0`)
  console.log(`Source snapshot sha256: ${snapshotHash}${report.sourceDirty ? ' (dirty working tree)' : ''}`)
  console.log('Production model/network calls: 0/0; real textbook/child records: 0/0')
  if (!gatePassed) process.exitCode = 1
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
