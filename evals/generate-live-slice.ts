import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { auditAiResponse } from '../functions/_shared/audit'
import { guardAiOutput } from '../functions/_shared/output-guard'
import { buildSystemPrompt } from '../functions/_shared/prompt'

interface Dataset {
  cases: Array<{
    id: string
    type: string
    grade?: 'lower' | 'upper'
    dimension: string
    input?: string
    expectedPass?: boolean
  }>
}

const required = ['EVAL_BASE_URL', 'EVAL_API_KEY', 'EVAL_MODEL_ID'] as const

async function main(): Promise<void> {
  if (process.env.EVAL_ALLOW_PAID_API !== 'YES') {
    throw new Error('Refusing live calls. Set EVAL_ALLOW_PAID_API=YES only after explicit approval and budget review.')
  }
  for (const name of required) {
    if (!process.env[name]) throw new Error(`Missing ${name}`)
  }
  const baseUrl = new URL(process.env.EVAL_BASE_URL as string)
  if (baseUrl.protocol !== 'https:') throw new Error('EVAL_BASE_URL must use HTTPS')
  const completionsUrl = new URL('chat/completions', `${baseUrl.toString().replace(/\/$/, '')}/`)
  const model = process.env.EVAL_MODEL_ID as string
  const apiKey = process.env.EVAL_API_KEY as string
  const maxCases = Math.min(30, Math.max(1, Number(process.env.EVAL_MAX_CASES ?? 12)))
  const root = process.cwd()
  const dataset = JSON.parse(await readFile(path.join(root, 'evals/cases/synthetic-v1.json'), 'utf8')) as Dataset
  const selected = dataset.cases
    .filter(item => item.type === 'coach_response' && item.expectedPass && item.input && item.grade)
    .slice(0, maxCases)
  const results = []

  for (const item of selected) {
    const systemPrompt = buildSystemPrompt(item.grade as 'lower' | 'upper', { subject: 'math' })
    const started = performance.now()
    const response = await fetch(completionsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: item.input },
        ],
        temperature: 0.2,
        max_tokens: 180,
        stream: false,
      }),
    })
    if (!response.ok) throw new Error(`Live provider failed for ${item.id}: HTTP ${response.status}`)
    const body = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }
    const content = body.choices?.[0]?.message?.content ?? ''
    const latencyMs = Math.round((performance.now() - started) * 100) / 100
    const audit = auditAiResponse(content)
    const guard = guardAiOutput(content, item.grade as 'lower' | 'upper')
    results.push({
      caseId: item.id,
      dimension: item.dimension,
      grade: item.grade,
      input: item.input,
      output: content,
      latencyMs,
      usage: body.usage ?? null,
      deterministic: { auditIssues: audit.issues, outputGuardBlocked: guard.blocked },
    })
  }

  const promptContract = buildSystemPrompt('upper', { subject: 'math' })
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dataPolicy: 'Synthetic prompts only. No real child or production transcript data.',
    providerBaseOrigin: baseUrl.origin,
    model,
    generation: { temperature: 0.2, maxTokens: 180 },
    promptHash: createHash('sha256').update(promptContract).digest('hex'),
    scope: { productionModelCalls: results.length, realChildRecords: 0 },
    deterministicHardFailures: results.filter(item => item.deterministic.outputGuardBlocked).length,
    gate: {
      passed: false,
      reason: 'Live generation completed; blinded human review has not yet been merged.',
    },
    cases: results,
  }
  const outputDir = path.join(root, 'evals/results/live')
  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Generated ${results.length} approved live synthetic cases for model ${model}.`)
  console.log('Release remains blocked pending blinded human review.')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
