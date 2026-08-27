import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  CircleSlash2,
  Database,
  FileSearch2,
  FlaskConical,
  GitCommit,
  LockKeyhole,
  Network,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'

interface EvalReport {
  generatedAt: string
  sourceCommit: string
  sourceDirty: boolean
  sourceSnapshotHash: string
  datasetHash: string
  dataPolicy: string
  summary: { total: number; matched: number; mismatched: number }
  coverage: Record<string, number>
  gate: {
    passed: boolean
    metrics: Record<string, number>
  }
  scope: {
    productionModelCalls: number
    realChildRecords: number
    modelGraderUsed: boolean
    humanReviewStatus: string
  }
}

type RagStatus = 'disabled' | 'degraded' | 'no_results' | 'used'

interface RagCitation {
  citationId: string
  sourceId: string
  sourceTitle: string
  documentId: string
  documentTitle: string
  chapterId: string
  chapterTitle: string
  sectionId: string
  sectionTitle: string
  chunkId: string
  contentHash: string
  locator: {
    sectionPath: string
    pageStart?: number
    pageEnd?: number
    lineStart?: number
    lineEnd?: number
    charStart?: number
    charEnd?: number
  }
}

interface RagRuntimeState {
  status: RagStatus
  reason: string
  citationCount: number
  truncated: boolean
  citations: RagCitation[]
}

interface RagReport {
  generatedAt: string
  sourceCommit: string
  sourceDirty: boolean
  sourceSnapshotHash: string
  summary: {
    total: number
    passed: number
    failed: number
    goldQueries: number
    badCases: number
  }
  gate: {
    passed: boolean
    metrics: {
      meanRecallAtK: number
      meanPrecisionAtK: number
      citationCorrectness: number
      badCasePassRate: number
    }
  }
  scope: {
    productionModelCalls: number
    fakeLlmCalls: number
    networkCalls: number
    realTextbookRecords: number
    realChildRecords: number
    vectorizeDeployment: boolean
    productionEmbeddingProvider: boolean
  }
  showcase: {
    runtimeStates: RagRuntimeState[]
    llmGateway: {
      providerId: string
      model: string
      mode: 'complete' | 'stream'
      durationMs: number
      timeoutMs: number
      timedOut: boolean
      finishReason?: string
    }
    outputGuard: {
      candidate: string
      blocked: boolean
      fallback: string
      blockingIssues: string[]
    }
    dataPolicy: string
  }
}

const SYNTHETIC_TRANSCRIPT = [
  { role: 'student', label: 'Synthetic learner', text: '我不会算 12-5。' },
  { role: 'coach', label: 'Guarded coach', text: '没关系，先圈出12。你想先拿走几个？' },
  { role: 'student', label: 'Synthetic learner', text: '先拿走2，就剩10。' },
  { role: 'coach', label: 'Guarded coach', text: '你已经拿走2了。还需要再拿走几个？' },
]

const PRODUCT_LOOP = [
  { title: 'Question', detail: 'Text or camera/OCR enters as untrusted data.' },
  { title: 'Context', detail: 'Grade policy plus optional bounded RAG evidence.' },
  { title: 'Coach', detail: 'One cognitive action, not a worked answer.' },
  { title: 'Guard', detail: 'Blocking check runs last before display and TTS.' },
  { title: 'Transfer', detail: 'A new question checks reusable understanding.' },
]

const STATUS_COPY: Record<RagStatus, {
  title: string
  eyebrow: string
  behavior: string
  tone: string
  icon: typeof CheckCircle2
}> = {
  used: {
    title: 'Evidence attached',
    eyebrow: 'RAG used',
    behavior: 'Filtered synthetic context is attached in a separate untrusted field; structured citations remain inspectable.',
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    icon: CheckCircle2,
  },
  disabled: {
    title: 'Original chat continues',
    eyebrow: 'Default state',
    behavior: 'The feature flag is absent or false. Retrieval is skipped and the original non-RAG path continues.',
    tone: 'border-slate-300 bg-slate-50 text-slate-900',
    icon: CircleSlash2,
  },
  degraded: {
    title: 'Safe degradation',
    eyebrow: 'Service incomplete or failed',
    behavior: 'The app records a coarse degraded status, attaches no textbook context, and preserves the original chat path.',
    tone: 'border-amber-300 bg-amber-50 text-amber-950',
    icon: TriangleAlert,
  },
  no_results: {
    title: 'No evidence above threshold',
    eyebrow: 'No result',
    behavior: 'No chunk survives the configured filters and threshold. The app attaches no context and continues without RAG.',
    tone: 'border-sky-300 bg-sky-50 text-sky-950',
    icon: FileSearch2,
  },
}

const METRIC_LABELS: Record<string, string> = {
  positiveControlPassRate: 'Compliant controls',
  negativeControlDetectionRecall: 'Bad-case detection',
  inputSafetyAccuracy: 'Input boundary',
  failureRecoveryAccuracy: 'Recovery policy',
  telemetryBudgetAccuracy: 'Budget checks',
}

function requestedStatus(): RagStatus {
  const value = new URLSearchParams(window.location.search).get('rag')
  return value && value in STATUS_COPY ? value as RagStatus : 'used'
}

function shortHash(value: string | undefined): string {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '—'
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function citationLocator(citation: RagCitation): string {
  const location = citation.locator
  if (location.pageStart !== undefined) {
    const pages = location.pageEnd && location.pageEnd !== location.pageStart
      ? `pp. ${location.pageStart}–${location.pageEnd}`
      : `p. ${location.pageStart}`
    return `${pages} · lines ${location.lineStart ?? '—'}–${location.lineEnd ?? '—'}`
  }
  return `lines ${location.lineStart ?? '—'}–${location.lineEnd ?? '—'} · chars ${location.charStart ?? '—'}–${location.charEnd ?? '—'}`
}

export default function SyntheticDemoPage() {
  const [behaviorReport, setBehaviorReport] = useState<EvalReport | null>(null)
  const [ragReport, setRagReport] = useState<RagReport | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<RagStatus>(requestedStatus)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const [behaviorResponse, ragResponse] = await Promise.all([
        fetch('/eval-report.json', { cache: 'no-store' }),
        fetch('/rag-eval-report.json', { cache: 'no-store' }),
      ])
      if (!behaviorResponse.ok || !ragResponse.ok) {
        throw new Error('Generated evidence reports are missing.')
      }
      const [behavior, rag] = await Promise.all([
        behaviorResponse.json() as Promise<EvalReport>,
        ragResponse.json() as Promise<RagReport>,
      ])
      setBehaviorReport(behavior)
      setRagReport(rag)
    }

    load().catch(reason => {
      setError(reason instanceof Error ? reason.message : 'Unable to load generated evidence.')
    })
  }, [])

  const runtimeState = useMemo(
    () => ragReport?.showcase.runtimeStates.find(state => state.status === selectedStatus),
    [ragReport, selectedStatus],
  )
  const citation = ragReport?.showcase.runtimeStates
    .find(state => state.status === 'used')
    ?.citations[0]
  const statusCopy = STATUS_COPY[selectedStatus]
  const StatusIcon = statusCopy.icon
  const allGatesPass = Boolean(behaviorReport?.gate.passed && ragReport?.gate.passed)

  return (
    <main className="min-h-full overflow-auto bg-[#f3f7f3] text-[#17352f]">
      <div className="mx-auto max-w-7xl px-5 py-7 md:px-8 md:py-10">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="flex items-start gap-3">
            <FlaskConical className="mt-0.5 shrink-0" size={19} aria-hidden="true" />
            <p><strong>Synthetic evidence mode.</strong> No real learner, textbook, credential, production model, paid API, or external network call.</p>
          </div>
          <span className="rounded-full bg-amber-200/70 px-3 py-1 text-xs font-bold uppercase tracking-wider">Not a user testimonial</span>
        </div>

        <header className="mb-9 grid gap-6 lg:grid-cols-[1.45fr_0.75fr] lg:items-end">
          <div>
            <p className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-teal-700">ThinkBud · inspectable AI coaching</p>
            <h1 className="max-w-4xl text-4xl font-black leading-[1.02] tracking-tight md:text-6xl">The learner does the thinking. The product enforces the boundary.</h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-[#526f68] md:text-lg">A credential-free walkthrough of the coaching loop, RAG trust boundary, provider gateway, blocking answer guard, recovery states, and the evidence chain behind each claim.</p>
          </div>
          <div className={`rounded-3xl border p-6 shadow-sm ${allGatesPass ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
            <div className="flex items-center gap-3">
              {allGatesPass
                ? <CheckCircle2 className="text-emerald-700" size={31} aria-hidden="true" />
                : <TriangleAlert className="text-rose-700" size={31} aria-hidden="true" />}
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#607a73]">Deterministic engineering gate</p>
                <p className="text-3xl font-black">{behaviorReport && ragReport ? (allGatesPass ? 'PASS' : 'FAIL') : 'LOADING'}</p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#607a73]">Full release remains blocked by human, legal/privacy, live-model, and asset evidence.</p>
          </div>
        </header>

        {error && (
          <section className="mb-7 rounded-2xl border border-rose-300 bg-white p-5" role="alert">
            <p className="font-bold text-rose-800">{error}</p>
            <p className="mt-1 text-sm text-[#607a73]">Run <code className="rounded bg-gray-100 px-1 py-0.5">npm run evidence</code>, then refresh.</p>
          </section>
        )}

        <section className="mb-8 rounded-3xl border border-[#d9e7df] bg-white p-5 shadow-sm md:p-7" data-showcase="product-loop">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">Product loop</p>
              <h2 className="mt-1 text-2xl font-black">One guarded path from question to transfer</h2>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-slate-100 px-3 py-1.5">RAG default OFF</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5">RTC default OFF</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5">Guard runs last</span>
            </div>
          </div>
          <ol className="grid gap-3 md:grid-cols-5">
            {PRODUCT_LOOP.map((step, index) => (
              <li key={step.title} className="relative rounded-2xl border border-[#e3ece7] bg-[#f8fbf9] p-4">
                <span className="mb-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#17352f] text-xs font-black text-white">{index + 1}</span>
                <h3 className="font-black">{step.title}</h3>
                <p className="mt-1 text-xs leading-5 text-[#607a73]">{step.detail}</p>
                {index < PRODUCT_LOOP.length - 1 && <ArrowRight className="absolute -right-2 top-5 hidden text-[#9bb2aa] md:block" size={16} aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </section>

        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-[#d9e7df] bg-white p-6 shadow-sm md:p-7" data-showcase="coaching-loop">
            <div className="mb-5 flex items-center gap-3">
              <Sparkles className="text-teal-700" aria-hidden="true" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">Synthetic product slice</p>
                <h2 className="text-xl font-black">Coach one step; keep the answer with the learner</h2>
              </div>
            </div>
            <div className="space-y-3">
              {SYNTHETIC_TRANSCRIPT.map((turn, index) => (
                <div key={`${turn.role}-${index}`} className={`flex ${turn.role === 'student' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${turn.role === 'student' ? 'bg-[#17352f] text-white' : 'bg-teal-50 text-[#17352f]'}`}>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] opacity-60">{turn.label}</p>
                    <p>{turn.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-dashed border-teal-300 bg-teal-50/60 p-4 text-sm">
              <p className="font-black">Transfer next</p>
              <p className="mt-1 leading-6 text-[#526f68]">The learner explains the remaining subtraction, then applies the same decomposition idea to a new synthetic problem.</p>
            </div>
          </section>

          <section className="rounded-3xl border border-rose-200 bg-[#fffafa] p-6 shadow-sm md:p-7" data-showcase="answer-guard">
            <div className="mb-5 flex items-center gap-3">
              <ShieldAlert className="text-rose-700" aria-hidden="true" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-700">Blocking output guard</p>
                <h2 className="text-xl font-black">Unsafe candidate never enters SSE</h2>
              </div>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wider text-rose-700">Fake-provider candidate</p>
                <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-black uppercase text-rose-800">Blocked</span>
              </div>
              <p className="mt-3 text-lg font-black line-through decoration-rose-500 decoration-2">{ragReport?.showcase.outputGuard.candidate ?? '答案是7。'}</p>
              <p className="mt-2 text-xs text-[#7d5a5a]">{ragReport?.showcase.outputGuard.blockingIssues.join(' · ') || 'Detected answer leakage'}</p>
            </div>
            <div className="my-3 flex justify-center"><ArrowRight className="rotate-90 text-rose-400" aria-hidden="true" /></div>
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-emerald-800">Guarded fallback sent to display / TTS</p>
              <p className="mt-3 text-lg font-black leading-7">{ragReport?.showcase.outputGuard.fallback ?? '我不能替你写答案。先圈出你确定的数，它是几？'}</p>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#607a73]">This is a deterministic fake-LLM integration case. It demonstrates ordering and fallback behavior, not live-model safety quality.</p>
          </section>
        </div>

        <section className="mb-8 rounded-3xl border border-[#d9e7df] bg-white p-6 shadow-sm md:p-7" data-showcase="rag-contract">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">RAG runtime contract</p>
              <h2 className="mt-1 text-2xl font-black">Four states; one safe fallback rule</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#607a73]">Choose a deterministic state. Only <em>used</em> attaches bounded, untrusted context; every other state preserves the original chat path.</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold">
              <Database size={14} aria-hidden="true" />
              Vectorize deployment: false
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-4" role="group" aria-label="RAG runtime state">
            {(['used', 'disabled', 'degraded', 'no_results'] as RagStatus[]).map(status => {
              const copy = STATUS_COPY[status]
              const StateIcon = copy.icon
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={selectedStatus === status}
                  onClick={() => setSelectedStatus(status)}
                  className={`rounded-2xl border p-4 text-left transition ${selectedStatus === status ? copy.tone + ' ring-2 ring-offset-2 ring-[#17352f]' : 'border-[#e1ebe6] bg-[#f8fbf9] hover:border-[#9bb2aa]'}`}
                >
                  <StateIcon size={19} aria-hidden="true" />
                  <span className="mt-3 block text-sm font-black">{copy.eyebrow}</span>
                  <span className="mt-1 block text-xs opacity-70">{status}</span>
                </button>
              )
            })}
          </div>

          <div className={`mt-5 rounded-2xl border p-5 ${statusCopy.tone}`}>
            <div className="flex items-start gap-3">
              <StatusIcon className="mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wider">{statusCopy.eyebrow}</p>
                <h3 className="mt-1 text-xl font-black">{statusCopy.title}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6">{statusCopy.behavior}</p>
                <p className="mt-3 break-words rounded-xl bg-white/60 px-3 py-2 text-xs leading-5"><strong>Runtime reason:</strong> {runtimeState?.reason ?? 'Loading generated RAG evidence…'}</p>
              </div>
            </div>
          </div>

          {selectedStatus === 'used' && citation && (
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileSearch2 className="text-teal-700" size={18} aria-hidden="true" />
                    <p className="font-black">Structured citation {citation.citationId}</p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider">Synthetic test-only</span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-[#607a73]">Source</dt><dd className="font-black">{citation.sourceTitle}</dd></div>
                  <div><dt className="text-xs text-[#607a73]">Chapter</dt><dd className="font-black">{citation.chapterTitle}</dd></div>
                  <div><dt className="text-xs text-[#607a73]">Section</dt><dd className="font-black">{citation.sectionTitle}</dd></div>
                  <div><dt className="text-xs text-[#607a73]">Locator</dt><dd className="font-black">{citationLocator(citation)}</dd></div>
                </dl>
              </div>
              <div className="rounded-2xl border border-[#e1ebe6] bg-[#f8fbf9] p-5 text-xs leading-5 text-[#526f68]">
                <p><strong>Section path</strong><br />{citation.locator.sectionPath}</p>
                <p className="mt-3"><strong>Source ID</strong><br /><code className="break-all">{citation.sourceId}</code></p>
                <p className="mt-3"><strong>Chunk / content hash</strong><br /><code className="break-all">{citation.chunkId} · {shortHash(citation.contentHash)}</code></p>
              </div>
            </div>
          )}
        </section>

        <div className="mb-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-3xl border border-[#d9e7df] bg-[#17352f] p-6 text-white shadow-sm md:p-7" data-showcase="llm-gateway">
            <div className="flex items-center gap-3">
              <Network className="text-emerald-300" aria-hidden="true" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">LLM gateway status</p>
                <h2 className="text-xl font-black">Offline fake provider · typed metadata</h2>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-white/10 p-3"><dt className="text-xs text-emerald-100">Provider</dt><dd className="mt-1 font-black">{ragReport?.showcase.llmGateway.providerId ?? 'fake-llm'}</dd></div>
              <div className="rounded-2xl bg-white/10 p-3"><dt className="text-xs text-emerald-100">Model</dt><dd className="mt-1 font-black">{ragReport?.showcase.llmGateway.model ?? 'fake-model-v1'}</dd></div>
              <div className="rounded-2xl bg-white/10 p-3"><dt className="text-xs text-emerald-100">Mode / finish</dt><dd className="mt-1 font-black">{ragReport?.showcase.llmGateway.mode ?? 'complete'} · {ragReport?.showcase.llmGateway.finishReason ?? 'stop'}</dd></div>
              <div className="rounded-2xl bg-white/10 p-3"><dt className="text-xs text-emerald-100">Timeout</dt><dd className="mt-1 font-black">{ragReport?.showcase.llmGateway.timedOut ? 'timed out' : 'not timed out'}</dd></div>
            </dl>
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-700 bg-emerald-950/50 p-3 text-xs leading-5 text-emerald-100">
              <LockKeyhole className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
              <p>Production calls: {ragReport?.scope.productionModelCalls ?? 0}. Network calls: {ragReport?.scope.networkCalls ?? 0}. Keys never enter this browser build.</p>
            </div>
          </section>

          <section className="rounded-3xl border border-[#d9e7df] bg-white p-6 shadow-sm md:p-7" data-showcase="evidence-chain">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">Evidence chain</p>
                <h2 className="text-xl font-black">Claims tied to clean source snapshots</h2>
              </div>
              <GitCommit className="text-teal-700" aria-hidden="true" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#e1ebe6] bg-[#f8fbf9] p-4">
                <p className="text-xs font-bold text-[#607a73]">Behavior gate</p>
                <p className="mt-1 text-3xl font-black">{behaviorReport ? `${behaviorReport.summary.matched}/${behaviorReport.summary.total}` : '—'}</p>
                <p className="mt-2 text-xs text-[#607a73]">sourceDirty={String(behaviorReport?.sourceDirty ?? false)} · {shortHash(behaviorReport?.sourceCommit)}</p>
              </div>
              <div className="rounded-2xl border border-[#e1ebe6] bg-[#f8fbf9] p-4">
                <p className="text-xs font-bold text-[#607a73]">RAG gate</p>
                <p className="mt-1 text-3xl font-black">{ragReport ? `${ragReport.summary.passed}/${ragReport.summary.total}` : '—'}</p>
                <p className="mt-2 text-xs text-[#607a73]">sourceDirty={String(ragReport?.sourceDirty ?? false)} · {shortHash(ragReport?.sourceCommit)}</p>
              </div>
            </div>
            {behaviorReport && (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {Object.entries(behaviorReport.gate.metrics).map(([key, value]) => (
                  <div key={key} className="rounded-xl bg-teal-50 p-3">
                    <p className="min-h-8 text-[10px] font-bold leading-4 text-[#607a73]">{METRIC_LABELS[key] ?? key}</p>
                    <p className="mt-1 text-lg font-black text-teal-800">{percent(value)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 md:p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-amber-800" aria-hidden="true" />
            <div>
              <h2 className="text-xl font-black text-amber-950">What this demo does not prove</h2>
              <p className="mt-2 max-w-5xl text-sm leading-6 text-amber-900">It validates encoded behavior on synthetic fixtures. It does not prove live-model teaching quality, learning outcomes, external adoption, production Vectorize, production latency or cost, textbook rights, privacy compliance, or child-release readiness. Fresh model evidence, two-rater blinded review, 11 owner attestations, a license choice, and child/privacy approval remain fail-closed.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
