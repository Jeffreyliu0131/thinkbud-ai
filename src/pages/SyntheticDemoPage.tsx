import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleSlash2,
  Database,
  FileSearch2,
  FlaskConical,
  GitCommit,
  GitBranch,
  LockKeyhole,
  Network,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import BudMascot from '../components/BudMascot'
import './SyntheticDemoPage.css'

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
    tone: 'tb-tone--used',
    icon: CheckCircle2,
  },
  disabled: {
    title: 'Original chat continues',
    eyebrow: 'Default state',
    behavior: 'The feature flag is absent or false. Retrieval is skipped and the original non-RAG path continues.',
    tone: 'tb-tone--neutral',
    icon: CircleSlash2,
  },
  degraded: {
    title: 'Safe degradation',
    eyebrow: 'Service incomplete or failed',
    behavior: 'The app records a coarse degraded status, attaches no textbook context, and preserves the original chat path.',
    tone: 'tb-tone--warning',
    icon: TriangleAlert,
  },
  no_results: {
    title: 'No evidence above threshold',
    eyebrow: 'No result',
    behavior: 'No chunk survives the configured filters and threshold. The app attaches no context and continues without RAG.',
    tone: 'tb-tone--info',
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
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : 'n/a'
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function citationLocator(citation: RagCitation): string {
  const location = citation.locator
  if (location.pageStart !== undefined) {
    const pages = location.pageEnd && location.pageEnd !== location.pageStart
      ? `pp. ${location.pageStart}-${location.pageEnd}`
      : `p. ${location.pageStart}`
    return `${pages} / lines ${location.lineStart ?? 'n/a'}-${location.lineEnd ?? 'n/a'}`
  }
  return `lines ${location.lineStart ?? 'n/a'}-${location.lineEnd ?? 'n/a'} / chars ${location.charStart ?? 'n/a'}-${location.charEnd ?? 'n/a'}`
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
    <main className="tb-showcase" id="top">
      <nav className="tb-nav" aria-label="Showcase navigation">
        <a className="tb-brand" href="#top" aria-label="ThinkBud showcase home">
          <span className="tb-brand__mark" aria-hidden="true"><BudMascot animate="idle" /></span>
          <span>ThinkBud</span>
        </a>
        <div className="tb-nav__links">
          <a href="#product-loop">Mechanism</a>
          <a href="#rag-contract">RAG boundary</a>
          <a href="#evidence-chain">Evidence</a>
        </div>
        <a className="tb-nav__source" href="https://github.com/Jeffreyliu0131/thinkbud-ai" target="_blank" rel="noreferrer">
          Source <GitBranch size={16} aria-hidden="true" />
        </a>
      </nav>

      <div className="tb-shell">
        <aside className="tb-synthetic-note">
          <div><FlaskConical size={18} aria-hidden="true" /><p><strong>Synthetic evidence mode.</strong> No real learner, textbook, credential, production model, paid API, or external network call.</p></div>
          <span>Portfolio evidence, not user research</span>
        </aside>

        <header className="tb-hero">
          <div className="tb-hero__copy">
            <p className="tb-kicker">Inspectable Socratic coaching</p>
            <h1>Coach thinking, not answers.</h1>
            <p className="tb-hero__lede">Bounded RAG, blocking answer guards, and reproducible synthetic evals in one reviewable coaching loop.</p>
            <div className="tb-hero__actions">
              <a className="tb-button tb-button--primary" href="#product-loop">See the mechanism <ArrowRight size={17} aria-hidden="true" /></a>
              <a className="tb-button tb-button--quiet" href="https://github.com/Jeffreyliu0131/thinkbud-ai" target="_blank" rel="noreferrer">View source <ArrowUpRight size={17} aria-hidden="true" /></a>
            </div>
          </div>

          <div className="tb-hero__visual" aria-label="Synthetic ThinkBud coaching preview">
            <div className="tb-coach-presence">
              <div className="tb-coach-presence__mascot" aria-hidden="true"><BudMascot animate="wave" /></div>
              <div><strong>Guarded coach</strong><span>One cognitive action at a time</span></div>
            </div>
            <div className="tb-hero-dialogue">
              <p className="tb-message tb-message--learner"><span>Synthetic learner</span>我不会算 12-5。</p>
              <p className="tb-message tb-message--coach"><span>ThinkBud</span>没关系，先圈出12。你想先拿走几个？</p>
            </div>
            <div className={`tb-gate ${allGatesPass ? 'tb-gate--pass' : 'tb-gate--fail'}`} aria-live="polite">
              {allGatesPass ? <CheckCircle2 size={21} aria-hidden="true" /> : <TriangleAlert size={21} aria-hidden="true" />}
              <div><span>Deterministic engineering gate</span><strong>{behaviorReport && ragReport ? (allGatesPass ? 'PASS' : 'FAIL') : 'Loading evidence'}</strong></div>
            </div>
          </div>
        </header>

        {error && (
          <section className="tb-error" role="alert">
            <p><strong>{error}</strong></p>
            <p>Run <code>npm run evidence</code>, then refresh.</p>
          </section>
        )}

        <section id="product-loop" className="tb-section tb-mechanism" data-showcase="product-loop">
          <div className="tb-section__intro">
            <h2>One guarded path from question to transfer</h2>
            <p>The model can help with language. The product still owns the boundary, fallback, and release decision.</p>
          </div>
          <dl className="tb-contract-strip">
            <div><dt>Textbook RAG</dt><dd>Default off</dd></div>
            <div><dt>Managed voice</dt><dd>Default off</dd></div>
            <div><dt>Output guard</dt><dd>Always last</dd></div>
          </dl>
          <ol className="tb-loop">
            {PRODUCT_LOOP.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><h3>{step.title}</h3><p>{step.detail}</p></div>
                {index < PRODUCT_LOOP.length - 1 && <ArrowRight className="tb-loop__arrow" size={17} aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </section>

        <div className="tb-proof-grid">
          <section className="tb-section tb-coaching" data-showcase="coaching-loop">
            <div className="tb-section__title"><Sparkles aria-hidden="true" /><h2>The answer stays with the learner</h2></div>
            <div className="tb-transcript">
              {SYNTHETIC_TRANSCRIPT.map((turn, index) => (
                <div key={`${turn.role}-${index}`} className={`tb-transcript__turn tb-transcript__turn--${turn.role}`}>
                  <p><span>{turn.label}</span>{turn.text}</p>
                </div>
              ))}
            </div>
            <div className="tb-transfer"><strong>Transfer next</strong><p>The learner explains the remaining subtraction, then reuses the idea on a new synthetic problem.</p></div>
          </section>

          <section className="tb-section tb-guard" data-showcase="answer-guard">
            <div className="tb-section__title"><ShieldAlert aria-hidden="true" /><h2>Unsafe output never reaches the learner</h2></div>
            <div className="tb-guard__candidate">
              <div><span>Fake-provider candidate</span><strong>Blocked</strong></div>
              <p>{ragReport?.showcase.outputGuard.candidate ?? '答案是7。'}</p>
              <small>{ragReport?.showcase.outputGuard.blockingIssues.join(' / ') || 'Detected answer leakage'}</small>
            </div>
            <ArrowRight className="tb-guard__arrow" aria-hidden="true" />
            <div className="tb-guard__fallback">
              <span>Fallback sent to display and TTS</span>
              <p>{ragReport?.showcase.outputGuard.fallback ?? '我不能替你写答案。先圈出你确定的数，它是几？'}</p>
            </div>
            <p className="tb-caption">This deterministic fake-LLM case proves ordering and fallback behavior, not live-model safety quality.</p>
          </section>
        </div>

        <section id="rag-contract" className="tb-section tb-rag" data-showcase="rag-contract">
          <div className="tb-section__intro">
            <h2>Four RAG states. One safe fallback.</h2>
            <p>Only <em>used</em> attaches bounded, untrusted context. Every other state preserves the original chat path.</p>
          </div>
          <div className="tb-rag__meta"><Database size={15} aria-hidden="true" /> Vectorize deployment: false</div>

          <div className="tb-rag__workspace">
            <div className="tb-rag__states" role="group" aria-label="RAG runtime state">
              {(['used', 'disabled', 'degraded', 'no_results'] as RagStatus[]).map(status => {
                const copy = STATUS_COPY[status]
                const StateIcon = copy.icon
                return (
                  <button key={status} type="button" aria-pressed={selectedStatus === status} onClick={() => setSelectedStatus(status)}>
                    <StateIcon size={18} aria-hidden="true" />
                    <span><strong>{copy.eyebrow}</strong><small>{status}</small></span>
                  </button>
                )
              })}
            </div>
            <div className={`tb-rag__state ${statusCopy.tone}`}>
              <StatusIcon aria-hidden="true" />
              <div><span>{statusCopy.eyebrow}</span><h3>{statusCopy.title}</h3><p>{statusCopy.behavior}</p><code>Runtime reason: {runtimeState?.reason ?? 'Loading generated RAG evidence…'}</code></div>
            </div>
          </div>

          {selectedStatus === 'used' && citation && (
            <div className="tb-citation">
              <div className="tb-citation__summary">
                <div><FileSearch2 size={19} aria-hidden="true" /><strong>Structured citation {citation.citationId}</strong></div>
                <dl>
                  <div><dt>Source</dt><dd>{citation.sourceTitle}</dd></div>
                  <div><dt>Chapter</dt><dd>{citation.chapterTitle}</dd></div>
                  <div><dt>Section</dt><dd>{citation.sectionTitle}</dd></div>
                  <div><dt>Locator</dt><dd>{citationLocator(citation)}</dd></div>
                </dl>
              </div>
              <div className="tb-citation__trace">
                <p><strong>Section path</strong><span>{citation.locator.sectionPath}</span></p>
                <p><strong>Source ID</strong><code>{citation.sourceId}</code></p>
                <p><strong>Chunk / hash</strong><code>{citation.chunkId} / {shortHash(citation.contentHash)}</code></p>
              </div>
            </div>
          )}
        </section>

        <section id="evidence-chain" className="tb-section tb-evidence" data-showcase="evidence-chain">
          <div className="tb-section__intro">
            <h2>Claims tied to clean source snapshots</h2>
            <p>Passing gates prove the encoded mechanism on versioned synthetic fixtures. They do not prove adoption or learning outcomes.</p>
          </div>
          <GitCommit className="tb-evidence__icon" aria-hidden="true" />
          <div className="tb-evidence__scoreboard">
            <div><span>Behavior gate</span><strong>{behaviorReport ? `${behaviorReport.summary.matched}/${behaviorReport.summary.total}` : 'n/a'}</strong><small>sourceDirty={String(behaviorReport?.sourceDirty ?? false)} / {shortHash(behaviorReport?.sourceCommit)}</small></div>
            <div><span>RAG gate</span><strong>{ragReport ? `${ragReport.summary.passed}/${ragReport.summary.total}` : 'n/a'}</strong><small>sourceDirty={String(ragReport?.sourceDirty ?? false)} / {shortHash(ragReport?.sourceCommit)}</small></div>
          </div>
          {behaviorReport && (
            <dl className="tb-evidence__metrics">
              {Object.entries(behaviorReport.gate.metrics).map(([key, value]) => (
                <div key={key}><dt>{METRIC_LABELS[key] ?? key}</dt><dd>{percent(value)}</dd></div>
              ))}
            </dl>
          )}
        </section>

        <section className="tb-section tb-gateway" data-showcase="llm-gateway">
          <div className="tb-section__title"><Network aria-hidden="true" /><h2>Offline provider. Typed metadata. Zero hidden calls.</h2></div>
          <dl>
            <div><dt>Provider</dt><dd>{ragReport?.showcase.llmGateway.providerId ?? 'fake-llm'}</dd></div>
            <div><dt>Model</dt><dd>{ragReport?.showcase.llmGateway.model ?? 'fake-model-v1'}</dd></div>
            <div><dt>Mode / finish</dt><dd>{ragReport?.showcase.llmGateway.mode ?? 'complete'} / {ragReport?.showcase.llmGateway.finishReason ?? 'stop'}</dd></div>
            <div><dt>Timeout</dt><dd>{ragReport?.showcase.llmGateway.timedOut ? 'timed out' : 'not timed out'}</dd></div>
          </dl>
          <p><LockKeyhole size={16} aria-hidden="true" /> Production calls: {ragReport?.scope.productionModelCalls ?? 0}. Network calls: {ragReport?.scope.networkCalls ?? 0}. Keys never enter this browser build.</p>
        </section>

        <section className="tb-limitations">
          <ShieldCheck aria-hidden="true" />
          <div><h2>What this demo does not prove</h2><p>It does not prove live-model teaching quality, learning outcomes, external adoption, production Vectorize, production latency or cost, textbook rights, privacy compliance, or child-release readiness. Fresh model evidence, two-rater blinded review, 11 owner attestations, a license choice, and child/privacy approval remain fail-closed.</p></div>
        </section>

        <footer className="tb-footer">
          <p>ThinkBud is a reviewable prototype and product-evidence trail.</p>
          <a href="https://github.com/Jeffreyliu0131/thinkbud-ai" target="_blank" rel="noreferrer">Inspect the repository <ArrowUpRight size={16} aria-hidden="true" /></a>
        </footer>
      </div>
    </main>
  )
}
