import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { auditAiResponse } from '../functions/_shared/audit'
import { guardAiOutput } from '../functions/_shared/output-guard'
import { getGradeAdapter } from '../functions/_shared/prompt/grade-adapters'
import { sanitizeUntrustedText } from '../functions/_shared/input-safety'
import {
  decideVoiceFailure,
  formatInterruptedStreamContent,
  type VoiceFailureInput,
} from '../src/lib/failurePolicy'

type Grade = 'lower' | 'upper'

interface CoachResponseCase {
  id: string
  type: 'coach_response'
  dimension: string
  grade: Grade
  phase: string
  input: string
  response: string
  expectedPass: boolean
  expectedFailureCodes?: string[]
  constraints?: {
    requiresOneQuestion?: boolean
    requiresTransferBridge?: boolean
    requiresComfort?: boolean
  }
}

interface InputSafetyCase {
  id: string
  type: 'input_safety'
  dimension: string
  raw: string
  maxLength?: number
  expectedFlags: string[]
  forbiddenFragments?: string[]
}

interface FailurePolicyCase {
  id: string
  type: 'failure_policy'
  dimension: string
  event: VoiceFailureInput
  expected: { action: string; preserveConversation: boolean }
}

interface StreamFailureCase {
  id: string
  type: 'stream_failure'
  dimension: string
  partialContent: string
  errorMessage: string
  expectedContains: string[]
}

interface TelemetryBudgetCase {
  id: string
  type: 'telemetry_budget'
  dimension: string
  mode: 'text' | 'rtc'
  metrics: { latencyMs: number; outputTokens: number; estimatedCostUsd: number }
  expectedPass: boolean
}

type EvalCase =
  | CoachResponseCase
  | InputSafetyCase
  | FailurePolicyCase
  | StreamFailureCase
  | TelemetryBudgetCase

interface Dataset {
  schemaVersion: number
  name: string
  dataPolicy: string
  cases: EvalCase[]
}

interface GateConfig {
  schemaVersion: number
  dataset: string
  thresholds: Record<string, number>
  budgets: {
    textP95LatencyMs: number
    rtcTurnP95LatencyMs: number
    maxEstimatedCostUsdPerTurn: number
    maxOutputTokens: number
  }
}

interface CaseResult {
  id: string
  type: EvalCase['type']
  dimension: string
  evaluationMatched: boolean
  actualPass?: boolean
  expectedPass?: boolean
  failureCodes?: string[]
  details: Record<string, unknown>
}

const root = process.cwd()
const gatePath = path.join(root, 'evals/config/release-gate.json')
const EVIDENCE_SOURCE_FILES = [
  'functions/_shared/audit.ts',
  'functions/_shared/input-safety.ts',
  'functions/_shared/output-guard.ts',
  'functions/_shared/llm/types.ts',
  'functions/_shared/llm/gateway.ts',
  'functions/_shared/providers/chat/ark.ts',
  'functions/_shared/rag/context-builder.ts',
  'functions/_shared/rag/contract.ts',
  'functions/_shared/rag/embedding.ts',
  'functions/_shared/rag/ingestion.ts',
  'functions/_shared/rag/retrieval.ts',
  'functions/_shared/rag/runtime.ts',
  'functions/_shared/rag/types.ts',
  'functions/_shared/rag/vector-store.ts',
  'functions/_shared/rag/vectorize.ts',
  'functions/api/chat.ts',
  'src/App.tsx',
  'src/lib/failurePolicy.ts',
  'src/hooks/useChat.ts',
  'src/hooks/useVoicePipeline.ts',
  'src/types/chatState.ts',
  'src/pages/SyntheticDemoPage.tsx',
  'evals/run.ts',
  'evals/config/release-gate.json',
  'evals/cases/synthetic-v1.json',
  'evals/rag/run.ts',
  'evals/rag/cases/synthetic-rag-v1.json',
  'evals/rag/fixtures/corpus.json',
  'package.json',
  'package-lock.json',
]

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
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
    return execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0
  } catch {
    return true
  }
}

async function sourceSnapshotHash(): Promise<string> {
  const hasher = createHash('sha256')
  for (const relativePath of EVIDENCE_SOURCE_FILES) {
    hasher.update(relativePath)
    hasher.update('\0')
    hasher.update(await readFile(path.join(root, relativePath)))
    hasher.update('\0')
  }
  return hasher.digest('hex')
}

function mapAuditIssues(issues: string[]): string[] {
  const codes = new Set<string>()
  for (const issue of issues) {
    if (issue.includes('泄露了答案')) codes.add('SAF-ANSWER_LEAKAGE')
    if (issue.includes('直接确认')) codes.add('SAF-DIRECT_CONFIRM')
    if (issue.includes('完整步骤')) codes.add('SAF-STEP_LEAKAGE')
    if (issue.includes('一次问了')) codes.add('PED-MULTI_ACTION')
    if (issue.includes('回复过长')) codes.add('AGE-SENTENCE_COUNT')
    if (issue.includes('反问形式暗示')) codes.add('SAF-INDIRECT_HINT')
    if (issue.includes('是非题')) codes.add('PED-YES_NO')
    if (issue.includes('空洞智力表扬')) codes.add('PED-HOLLOW_PRAISE')
  }
  return [...codes]
}

function evaluateCoach(item: CoachResponseCase): CaseResult {
  const audit = auditAiResponse(item.response)
  const outputGuard = guardAiOutput(item.response, item.grade)
  const failures = new Set(mapAuditIssues(audit.issues))
  const adapter = getGradeAdapter(item.grade)
  const questionCount = (item.response.match(/[?？]/g) ?? []).length

  if (item.response.length > adapter.maxReplyLength) failures.add('AGE-REPLY_LENGTH')
  if (item.constraints?.requiresOneQuestion && questionCount !== 1) {
    failures.add('PED-QUESTION_COUNT')
  }
  if (item.constraints?.requiresTransferBridge && !/(刚才|上一题|前一道|之前)/.test(item.response)) {
    failures.add('PED-TRANSFER_BRIDGE')
  }
  if (item.constraints?.requiresComfort && !/(没关系|不着急|慢慢来|很正常|卡在这里)/.test(item.response)) {
    failures.add('PED-EMOTION_MISS')
  }

  const failureCodes = [...failures]
  const actualPass = failureCodes.length === 0
  const expectedCodesFound = (item.expectedFailureCodes ?? []).every(code => failures.has(code))
  const expectsBlockingSafetyFailure = (item.expectedFailureCodes ?? []).some(code =>
    ['SAF-ANSWER_LEAKAGE', 'SAF-DIRECT_CONFIRM', 'SAF-STEP_LEAKAGE', 'SAF-INDIRECT_HINT'].includes(code)
  )
  const guardExpectationMatched = expectsBlockingSafetyFailure
    ? outputGuard.blocked
    : !outputGuard.blocked
  const evaluationMatched = item.expectedPass === actualPass && expectedCodesFound && guardExpectationMatched

  return {
    id: item.id,
    type: item.type,
    dimension: item.dimension,
    evaluationMatched,
    actualPass,
    expectedPass: item.expectedPass,
    failureCodes,
    details: {
      grade: item.grade,
      phase: item.phase,
      responseLength: item.response.length,
      maxReplyLength: adapter.maxReplyLength,
      questionCount,
      auditIssues: audit.issues,
      outputGuardBlocked: outputGuard.blocked,
      outputGuardBlockingIssues: outputGuard.blockingIssues,
    },
  }
}

function evaluateInput(item: InputSafetyCase): CaseResult {
  const result = sanitizeUntrustedText(item.raw, { maxLength: item.maxLength })
  const expectedFlagsFound = item.expectedFlags.every(flag => result.flags.includes(flag as never))
  const unexpectedFlags = result.flags.filter(flag => !item.expectedFlags.includes(flag))
  const forbiddenRemoved = (item.forbiddenFragments ?? []).every(fragment => !result.text.includes(fragment))
  const evaluationMatched = expectedFlagsFound && unexpectedFlags.length === 0 && forbiddenRemoved

  return {
    id: item.id,
    type: item.type,
    dimension: item.dimension,
    evaluationMatched,
    failureCodes: evaluationMatched ? [] : ['INP-SANITIZER_MISMATCH'],
    details: {
      expectedFlags: item.expectedFlags,
      actualFlags: result.flags,
      changed: result.changed,
      truncated: result.truncated,
      forbiddenRemoved,
    },
  }
}

function evaluateFailure(item: FailurePolicyCase): CaseResult {
  const decision = decideVoiceFailure(item.event)
  const evaluationMatched = decision.action === item.expected.action
    && decision.preserveConversation === item.expected.preserveConversation
  return {
    id: item.id,
    type: item.type,
    dimension: item.dimension,
    evaluationMatched,
    failureCodes: evaluationMatched ? [] : ['REC-POLICY_MISMATCH'],
    details: { expected: item.expected, actual: decision },
  }
}

function evaluateStream(item: StreamFailureCase): CaseResult {
  const output = formatInterruptedStreamContent(item.partialContent, item.errorMessage)
  const evaluationMatched = item.expectedContains.every(fragment => output.includes(fragment))
  return {
    id: item.id,
    type: item.type,
    dimension: item.dimension,
    evaluationMatched,
    failureCodes: evaluationMatched ? [] : ['REC-PARTIAL_STREAM_LOST'],
    details: { output, expectedContains: item.expectedContains },
  }
}

function evaluateTelemetry(item: TelemetryBudgetCase, config: GateConfig): CaseResult {
  const latencyBudget = item.mode === 'rtc'
    ? config.budgets.rtcTurnP95LatencyMs
    : config.budgets.textP95LatencyMs
  const failureCodes: string[] = []
  if (item.metrics.latencyMs > latencyBudget) failureCodes.push('OPS-LATENCY_BUDGET')
  if (item.metrics.outputTokens > config.budgets.maxOutputTokens) failureCodes.push('OPS-TOKEN_BUDGET')
  if (item.metrics.estimatedCostUsd > config.budgets.maxEstimatedCostUsdPerTurn) {
    failureCodes.push('OPS-COST_BUDGET')
  }
  const actualPass = failureCodes.length === 0
  return {
    id: item.id,
    type: item.type,
    dimension: item.dimension,
    evaluationMatched: actualPass === item.expectedPass,
    actualPass,
    expectedPass: item.expectedPass,
    failureCodes,
    details: { mode: item.mode, metrics: item.metrics, latencyBudget },
  }
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function reportHtml(report: Record<string, unknown>): string {
  const summary = report.summary as Record<string, number>
  const gate = report.gate as { passed: boolean; metrics: Record<string, number> }
  const cases = report.cases as CaseResult[]
  const failures = cases.filter(item => !item.evaluationMatched)
  const dimensions = report.coverage as Record<string, number>
  const cards = Object.entries(gate.metrics).map(([key, value]) => `
    <article><span>${escapeHtml(key)}</span><strong>${(value * 100).toFixed(0)}%</strong></article>`).join('')
  const coverageRows = Object.entries(dimensions).map(([key, value]) => `
    <tr><td>${escapeHtml(key)}</td><td>${value}</td></tr>`).join('')
  const failureRows = failures.length === 0
    ? '<tr><td colspan="3">No evaluator mismatches.</td></tr>'
    : failures.map(item => `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.dimension)}</td><td>${escapeHtml(item.failureCodes?.join(', ') ?? '')}</td></tr>`).join('')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ThinkBud synthetic eval evidence</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#17352f;background:#f4f8f5}body{margin:0}.wrap{max-width:1080px;margin:auto;padding:40px 24px}.banner{padding:12px 16px;border:1px solid #e0b54b;background:#fff6d8;border-radius:12px}.hero{display:flex;justify-content:space-between;gap:24px;align-items:end;margin:32px 0}.status{font-size:36px;font-weight:800;color:${gate.passed ? '#087a55' : '#b42318'}}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.grid article{background:#fff;border:1px solid #dce9e2;border-radius:14px;padding:18px}.grid span{display:block;color:#54716a;font-size:13px}.grid strong{font-size:28px}section{background:#fff;border:1px solid #dce9e2;border-radius:16px;padding:22px;margin-top:20px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #edf2ef;padding:10px 6px}.muted{color:#607a73;font-size:14px}code{word-break:break-all}h1,h2{margin-top:0}
</style></head><body><main class="wrap">
<div class="banner"><strong>Synthetic evidence only.</strong> No real child data and no production model or paid API calls. Passing this deterministic gate does not prove live-model teaching quality.</div>
<div class="hero"><div><h1>ThinkBud evaluation evidence</h1><p class="muted">Dataset ${escapeHtml(report.datasetHash)} · source snapshot ${escapeHtml(report.sourceSnapshotHash)}</p></div><div class="status">${gate.passed ? 'PASS' : 'FAIL'}</div></div>
<div class="grid">${cards}</div>
<section><h2>Coverage</h2><table><thead><tr><th>Dimension</th><th>Cases</th></tr></thead><tbody>${coverageRows}</tbody></table></section>
<section><h2>Evaluator mismatches</h2><p class="muted">${summary.matched}/${summary.total} cases matched their human-authored expected outcome.</p><table><thead><tr><th>Case</th><th>Dimension</th><th>Codes</th></tr></thead><tbody>${failureRows}</tbody></table></section>
<section><h2>Release interpretation</h2><p>Deterministic gate: <strong>${gate.passed ? 'PASS' : 'FAIL'}</strong>. Full model release: <strong>BLOCKED until fresh live outputs receive blinded human review</strong>. Model graders are advisory and may not override hard safety checks.</p></section>
</main></body></html>`
}

async function main(): Promise<void> {
  const started = performance.now()
  const gateRaw = await readFile(gatePath, 'utf8')
  const config = JSON.parse(gateRaw) as GateConfig
  const datasetPath = path.join(root, config.dataset)
  const datasetRaw = await readFile(datasetPath, 'utf8')
  const dataset = JSON.parse(datasetRaw) as Dataset
  const snapshotHash = await sourceSnapshotHash()

  const results = dataset.cases.map(item => {
    if (item.type === 'coach_response') return evaluateCoach(item)
    if (item.type === 'input_safety') return evaluateInput(item)
    if (item.type === 'failure_policy') return evaluateFailure(item)
    if (item.type === 'stream_failure') return evaluateStream(item)
    return evaluateTelemetry(item, config)
  })

  const positive = results.filter(item => item.type === 'coach_response' && item.expectedPass === true)
  const negative = results.filter(item => item.type === 'coach_response' && item.expectedPass === false)
  const input = results.filter(item => item.type === 'input_safety')
  const recovery = results.filter(item => item.type === 'failure_policy' || item.type === 'stream_failure')
  const telemetry = results.filter(item => item.type === 'telemetry_budget')
  const metrics = {
    positiveControlPassRate: rate(positive.filter(item => item.actualPass).length, positive.length),
    negativeControlDetectionRecall: rate(negative.filter(item => item.evaluationMatched).length, negative.length),
    inputSafetyAccuracy: rate(input.filter(item => item.evaluationMatched).length, input.length),
    failureRecoveryAccuracy: rate(recovery.filter(item => item.evaluationMatched).length, recovery.length),
    telemetryBudgetAccuracy: rate(telemetry.filter(item => item.evaluationMatched).length, telemetry.length),
  }
  const gatePassed = Object.entries(config.thresholds).every(([metric, threshold]) => {
    return (metrics[metric as keyof typeof metrics] ?? 0) >= threshold
  })
  const coverage = dataset.cases.reduce<Record<string, number>>((acc, item) => {
    acc[item.dimension] = (acc[item.dimension] ?? 0) + 1
    return acc
  }, {})
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    sourceCommit: sourceCommit(),
    sourceDirty: sourceDirty(),
    sourceSnapshotHash: snapshotHash,
    sourceSnapshotFiles: EVIDENCE_SOURCE_FILES,
    dataset: dataset.name,
    datasetHash: sha256(datasetRaw),
    configHash: sha256(gateRaw),
    dataPolicy: dataset.dataPolicy,
    scope: {
      deterministicChecks: true,
      productionModelCalls: 0,
      realChildRecords: 0,
      modelGraderUsed: false,
      humanReviewStatus: 'not_run',
    },
    summary: {
      total: results.length,
      matched: results.filter(item => item.evaluationMatched).length,
      mismatched: results.filter(item => !item.evaluationMatched).length,
    },
    coverage,
    gate: { passed: gatePassed, metrics, thresholds: config.thresholds },
    cases: results,
  }

  const latestDir = path.join(root, 'evals/results')
  const artifactDir = path.join(root, 'artifacts/evals/latest')
  const publicDir = path.join(root, 'public')
  await Promise.all([mkdir(latestDir, { recursive: true }), mkdir(artifactDir, { recursive: true }), mkdir(publicDir, { recursive: true })])
  const json = `${JSON.stringify(report, null, 2)}\n`
  const html = reportHtml(report as unknown as Record<string, unknown>)
  const markdown = `# ThinkBud synthetic eval result\n\n- Deterministic gate: **${gatePassed ? 'PASS' : 'FAIL'}**\n- Cases matched: **${report.summary.matched}/${report.summary.total}**\n- Dataset SHA-256: \`${report.datasetHash}\`\n- Source commit: \`${report.sourceCommit}\`\n- Source snapshot SHA-256: \`${report.sourceSnapshotHash}\` (${report.sourceDirty ? 'dirty working tree' : 'clean working tree'})\n- Production model calls: **0**\n- Real child records: **0**\n- Full model release: **BLOCKED pending fresh live outputs + blinded human review**\n`
  await Promise.all([
    writeFile(path.join(latestDir, 'latest.json'), json),
    writeFile(path.join(latestDir, 'latest.md'), markdown),
    writeFile(path.join(publicDir, 'eval-report.json'), json),
    writeFile(path.join(artifactDir, 'report.html'), html),
  ])

  console.log(`ThinkBud synthetic eval: ${gatePassed ? 'PASS' : 'FAIL'}`)
  console.log(`Cases matched: ${report.summary.matched}/${report.summary.total}`)
  console.log(`Dataset sha256: ${report.datasetHash}`)
  console.log(`Source snapshot sha256: ${report.sourceSnapshotHash}${report.sourceDirty ? ' (dirty working tree)' : ''}`)
  console.log('Production model calls: 0; real child records: 0')
  if (!gatePassed) process.exitCode = 1
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
