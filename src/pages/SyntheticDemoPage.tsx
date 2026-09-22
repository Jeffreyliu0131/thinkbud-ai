import { useDemoLocale } from '../lib/demoLocale'
import DemoLanguageSwitch from '../components/DemoLanguageSwitch'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleSlash2,
  Database,
  FileSearch2,
  GitCommit,
  GitBranch,
  LockKeyhole,
  Network,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import BudMascot from '../components/BudMascot'
import { demoAsset, demoRoute } from '../lib/demoPaths'
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
  { role: 'student', label: '预设学习者', text: '我不会算 12-5。' },
  { role: 'coach', label: '预设教练', text: '没关系，先圈出12。你想先拿走几个？' },
  { role: 'student', label: '预设学习者', text: '先拿走2，就剩10。' },
  { role: 'coach', label: '预设教练', text: '你已经拿走2了。还需要再拿走几个？' },
]

const PRODUCT_LOOP = [
  { title: '跟着练一题', detail: '一次完成一个步骤。连续答错时，换一个例子解释同一方法。' },
  { title: '自己做新题', detail: '撤去提示，独立展开并计算。重试、求助和首次完成分开记录。' },
  { title: '隔一段时间再试', detail: '24 小时后再检查。现在可以预览，但预览不会算作正式复测。' },
]

const STATUS_COPY: Record<RagStatus, {
  title: string
  eyebrow: string
  behavior: string
  tone: string
  icon: typeof CheckCircle2
}> = {
  used: {
    title: '附上可追溯的参考片段',
    eyebrow: '找到参考内容',
    behavior: '预设场景：筛选后的合成资料作为参考内容附加，并保留来源位置。参考资料不能覆盖教练规则。',
    tone: 'tb-tone--used',
    icon: CheckCircle2,
  },
  disabled: {
    title: '不检索，继续引导',
    eyebrow: '未开启检索',
    behavior: '预设场景：检索未启用，不附加任何教材内容。教练仍按原有规则引导。',
    tone: 'tb-tone--neutral',
    icon: CircleSlash2,
  },
  degraded: {
    title: '检索故障，不编造依据',
    eyebrow: '检索服务故障',
    behavior: '预设场景：配置不完整或服务失败时，不附加教材内容，也不把失败包装成检索成功。',
    tone: 'tb-tone--warning',
    icon: TriangleAlert,
  },
  no_results: {
    title: '没有合适的参考内容',
    eyebrow: '未找到结果',
    behavior: '预设场景：没有片段满足筛选条件，不生成引用，回到不依赖资料的引导路径。',
    tone: 'tb-tone--info',
    icon: FileSearch2,
  },
}

const METRIC_LABELS: Record<string, string> = {
  positiveControlPassRate: '正常样例',
  negativeControlDetectionRecall: '违规样例识别',
  inputSafetyAccuracy: '输入边界',
  failureRecoveryAccuracy: '失败恢复',
  telemetryBudgetAccuracy: '预算规则',
}

function requestedStatus(): RagStatus {
  const value = new URLSearchParams(window.location.hash.split('?')[1] ?? window.location.search).get('rag')
  return value && Object.hasOwn(STATUS_COPY, value) ? value as RagStatus : 'used'
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

function validReports(behavior: EvalReport, rag: RagReport): boolean {
  const text = (value: unknown) => typeof value === 'string'
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  const metadata = (value: EvalReport | RagReport) => value && text(value.sourceCommit) && typeof value.sourceDirty === 'boolean' && typeof value.gate?.passed === 'boolean'
  const citation = (value: RagCitation) => value && ['citationId', 'sourceTitle', 'chapterTitle', 'sectionTitle', 'sourceId', 'chunkId', 'contentHash'].every(key => text(value[key as keyof RagCitation])) && text(value.locator?.sectionPath)
  return Boolean(metadata(behavior) && metadata(rag)
    && number(behavior.summary?.matched) && number(behavior.summary?.total)
    && behavior.gate.metrics && Object.values(behavior.gate.metrics).every(number)
    && number(rag.summary?.passed) && number(rag.summary?.total)
    && number(rag.scope?.productionModelCalls) && number(rag.scope?.networkCalls)
    && Array.isArray(rag.showcase?.runtimeStates)
    && Object.keys(STATUS_COPY).every(status => rag.showcase.runtimeStates.some(state => state?.status === status))
    && rag.showcase.runtimeStates.every(state => state && text(state.reason) && Array.isArray(state.citations) && state.citations.every(citation))
    && text(rag.showcase.outputGuard?.candidate) && text(rag.showcase.outputGuard?.fallback)
    && typeof rag.showcase.outputGuard?.blocked === 'boolean'
    && Array.isArray(rag.showcase.outputGuard?.blockingIssues) && rag.showcase.outputGuard.blockingIssues.every(text)
    && text(rag.showcase.llmGateway?.providerId) && text(rag.showcase.llmGateway?.model)
    && text(rag.showcase.llmGateway?.mode) && typeof rag.showcase.llmGateway?.timedOut === 'boolean')
}

export default function SyntheticDemoPage() {
  const { t, locale } = useDemoLocale()
  const [behaviorReport, setBehaviorReport] = useState<EvalReport | null>(null)
  const [ragReport, setRagReport] = useState<RagReport | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<RagStatus>(requestedStatus)
  const [error, setError] = useState<string | null>(null)

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    const load = async () => {
      const responses = await Promise.all([
        fetch(demoAsset('eval-report.json'), { cache: 'no-store', signal: controller.signal }),
        fetch(demoAsset('rag-eval-report.json'), { cache: 'no-store', signal: controller.signal }),
      ])
      if (responses.some(response => !response.ok || !response.headers.get('content-type')?.includes('application/json'))) {
        throw new Error('报告暂时无法读取。')
      }
      const [behavior, rag] = await Promise.all(responses.map(response => response.json()))
      if (!validReports(behavior, rag)) throw new Error('报告格式不完整。')
      if (active) { setBehaviorReport(behavior); setRagReport(rag) }
    }
    load().catch(reason => {
      if (active) setError(reason instanceof Error && reason.name === 'AbortError' ? '报告读取超时。' : reason instanceof Error && ['报告暂时无法读取。', '报告格式不完整。'].includes(reason.message) ? reason.message : '报告内容无法读取。')
    }).finally(() => window.clearTimeout(timeout))
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [attempt])

  const retry = () => { setError(null); setBehaviorReport(null); setRagReport(null); setAttempt(value => value + 1) }
  const jumpTo = (id: string) => {
    const element = document.getElementById(id)
    if (!element) return
    const details = element.closest('details')
    if (details) details.open = true
    element.focus({ preventScroll: true })
    element.scrollIntoView({ behavior: 'auto', block: 'start' })
  }

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
    <main data-language={locale} className="tb-showcase" id="top" tabIndex={-1}>
      <nav className="tb-nav" aria-label={t("演示导航")}>
        <a className="tb-brand" href={demoRoute('/')} onClick={event => { event.preventDefault(); jumpTo('top') }} aria-label={t("ThinkBud 演示首页")}>
          <span className="tb-brand__mark" aria-hidden="true"><BudMascot animate="idle" /></span>
          <span>ThinkBud</span>
        </a>
        <div className="tb-nav__links">
          <a href={demoRoute('/practice')}>{t("体验一题")}</a>
          <a href={demoRoute('/')} onClick={event => { event.preventDefault(); jumpTo('product-loop') }}>{t("学习路径")}</a>
          <a href={demoRoute('/')} onClick={event => { event.preventDefault(); jumpTo('rag-contract') }}>{t("参考资料")}</a>
          <a href={demoRoute('/')} onClick={event => { event.preventDefault(); jumpTo('evidence-chain') }}>{t("实现与证据")}</a>
        </div>
        <div className="demo-nav-tools"><DemoLanguageSwitch /><a className="tb-nav__source" href="https://github.com/Jeffreyliu0131/thinkbud-ai" target="_blank" rel="noreferrer">
          {t("源码")}<GitBranch size={16} aria-hidden="true" />
        </a></div>
      </nav>

      <div className="tb-shell">

        <header className="tb-hero">
          <div className="tb-hero__copy">
            <p className="tb-kicker">{t('小学学习与思考教练')}</p>
            <h1>{t('做完这一题，')}<br />{t('能自己做下一题吗？')}</h1>
            <p className="tb-hero__lede">{t('面向小学语文、数学、英语，帮助学习者一步步想清楚。做题时得到的帮助，与离开帮助后能做什么，分别观察。')}</p>
            <p className="tb-demo-scope">{t('本次体验：四年级数学 · 分配律。语文、英语保留产品定位，本演示尚未提供对应互动流程。')}</p>
            <div className="tb-hero__actions">
              <a className="tb-button tb-button--primary" href={demoRoute('/practice')}>{t('开始数学体验')}<ArrowRight size={16} aria-hidden="true" /></a>
              <a className="tb-button tb-button--quiet" href={demoRoute('/')} onClick={event => { event.preventDefault(); jumpTo('product-loop') }}>{t('先看学习路径')}</a>
            </div>
            <aside className="tb-synthetic-note">{t('成人体验 · 无需账号 · 预设提示，不调用真实 AI')}</aside>
          </div>
          <div className="tb-hero__preview">
            <article className="tb-lesson" aria-label={t('预设练习片段')}>
              <div className="tb-lesson__meta"><span>{t('分配律 · 练习片段')}</span><span>{t('约 3 分钟体验')}</span></div>
              <h2 className="tb-lesson__title">{t('一次，只走一步')}</h2>
              <div className="tb-lesson__equation">6 × (10 + 4)</div>
              <div className="tb-lesson__prompt">
                <div className="tb-lesson__mascot" aria-hidden="true"><BudMascot emotion="thinking" /></div>
                <div><strong>{t('ThinkBud · 预设提示')}</strong><p>{t('括号里的两项都要参与。你能先把它展开吗？')}</p></div>
              </div>
              <div className="tb-lesson__footer"><span>01 / 04 · {t('引导练习')}</span><a href={demoRoute('/practice')}>{t('亲自试一题')}<ArrowRight size={15} aria-hidden="true" /></a></div>
            </article>
            <p className="tb-lesson__caption">{t('预设题目与提示，过程由你的作答推进。')}</p>
          </div>
        </header>


        <section id="product-loop" tabIndex={-1} className="tb-section tb-mechanism" data-showcase="product-loop">
          <div className="tb-section__intro">
            <p className="tb-kicker">{t('一条学习路径，三种不同的观察。')}</p>
            <h2>{t("帮助会逐步撤去，观察才有区别。")}</h2>
            <p>{t("你可以故意答错、请求提示，或独立完成。系统会根据操作推进流程，并保留不同的完成方式。")}</p>
          </div>

          <ol className="tb-loop">
            {PRODUCT_LOOP.map((step, index) => (
              <li key={t(step.title)}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><h3>{t(step.title)}</h3><p>{t(step.detail)}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <details className="tb-engineering" open={new URLSearchParams(window.location.hash.split('?')[1] ?? window.location.search).has('rag') || undefined}>
          <summary><div><strong>{t("查看实现与证据")}</strong><span>{t("预设对话 · 检索状态 · 合成测试报告")}</span></div><Plus size={19} strokeWidth={1.4} aria-hidden="true" /></summary>
          <p className="tb-engineering-note">{t("以下是供进一步审阅的合成案例。切换状态不会发起真实检索，对话也不是实时生成。")}</p>
          {!behaviorReport && !error && <p className="tb-loading" role="status">{t("正在读取合成报告，数学体验可正常使用。")}</p>}
          {error && <section className="tb-error" role="alert"><p><strong>{t(error)}</strong> {t("数学体验仍可使用。")}</p><button className="tb-button tb-button--quiet" type="button" onClick={retry}>{t("重新加载报告")}</button></section>}
        <div className="tb-proof-grid">
          <section className="tb-section tb-coaching" data-showcase="coaching-loop">
            <div className="tb-section__title"><Sparkles aria-hidden="true" /><h2>{t("预设对话：让学习者继续想")}</h2></div>
            <div className="tb-transcript">
              {SYNTHETIC_TRANSCRIPT.map((turn, index) => (
                <div key={`${turn.role}-${index}`} className={`tb-transcript__turn tb-transcript__turn--${turn.role}`}>
                  <p><span>{t(turn.label)}</span>{t(turn.text)}</p>
                </div>
              ))}
            </div>
            <div className="tb-transfer"><strong>{t("接着检查迁移")}</strong><p>{t("这段减法对话是另一个预设案例。可操作的分配律练习会用新题检查方法，避免把跟着做完当作独立完成。")}</p></div>
          </section>

          <section className="tb-section tb-guard" data-showcase="answer-guard">
            <div className="tb-section__title"><ShieldAlert aria-hidden="true" /><h2>{t("预设案例：拦下直接给出的答案")}</h2></div>
            <div className="tb-guard__candidate">
              <div><span>{t("离线假模型的候选输出")}</span><strong>{ragReport ? (ragReport.showcase.outputGuard.blocked ? t("已拦截") : t("未拦截")) : t("待读取")}</strong></div>
              <p>{t(ragReport?.showcase.outputGuard.candidate ?? '报告未加载')}</p>
              <small>{ragReport?.showcase.outputGuard.blockingIssues.map(issue => t(issue)).join(' / ') || '—'}</small>
            </div>
            <ArrowRight className="tb-guard__arrow" aria-hidden="true" />
            <div className="tb-guard__fallback">
              <span>{t("替代提示（此处不播放语音）")}</span>
              <p>{t(ragReport?.showcase.outputGuard.fallback ?? '报告未加载')}</p>
            </div>
            <p className="tb-caption">{t("这是本地合成测试的已记录结果。它验证了该样例的拦截与替代顺序，不能保证真实模型永不泄露答案。")}</p>
          </section>
        </div>

        <section id="rag-contract" tabIndex={-1} className="tb-section tb-rag" data-showcase="rag-contract">
          <div className="tb-section__intro">
            <h2>{t("有资料、没资料、出故障，分别怎么办？")}</h2>
            <p>{t("点选一种预设检索场景，查看系统会采用什么依据。只有“找到参考内容”才展示合成引用。")}</p>
          </div>
          <div className="tb-rag__meta"><Database size={15} aria-hidden="true" /> {t("预设状态 · 无真实教材检索")}</div>

          <div className="tb-rag__workspace">
            <div className="tb-rag__states" role="group" aria-label={t("预设检索状态")}>
              {(['used', 'disabled', 'degraded', 'no_results'] as RagStatus[]).map(status => {
                const copy = STATUS_COPY[status]
                const StateIcon = copy.icon
                return (
                  <button key={status} type="button" aria-pressed={selectedStatus === status} onClick={() => setSelectedStatus(status)}>
                    <StateIcon size={18} aria-hidden="true" />
                    <span><strong>{t(copy.eyebrow)}</strong><small>{status}</small></span>
                  </button>
                )
              })}
            </div>
            <div className={`tb-rag__state ${statusCopy.tone}`} aria-live="polite">
              <StatusIcon aria-hidden="true" />
              <div><span>{t(statusCopy.eyebrow)}</span><h3>{t(statusCopy.title)}</h3><p>{t(statusCopy.behavior)}</p><code>{t("样例记录：")} {runtimeState?.reason ?? (error ? t("报告不可用") : t("正在读取…"))}</code></div>
            </div>
          </div>

          {selectedStatus === 'used' && citation && (
            <div className="tb-citation">
              <div className="tb-citation__summary">
                <div><FileSearch2 size={19} aria-hidden="true" /><strong>{t("合成引用")} {citation.citationId}</strong></div>
                <dl>
                  <div><dt>{t("资料")}</dt><dd>{citation.sourceTitle}</dd></div>
                  <div><dt>{t("章节")}</dt><dd>{citation.chapterTitle}</dd></div>
                  <div><dt>{t("小节")}</dt><dd>{citation.sectionTitle}</dd></div>
                  <div><dt>{t("位置")}</dt><dd>{citationLocator(citation)}</dd></div>
                </dl>
              </div>
              <div className="tb-citation__trace">
                <p><strong>{t("来源路径")}</strong><span>{citation.locator.sectionPath}</span></p>
                <p><strong>{t("来源 ID")}</strong><code>{citation.sourceId}</code></p>
                <p><strong>{t("片段 / 哈希")}</strong><code>{citation.chunkId} / {shortHash(citation.contentHash)}</code></p>
              </div>
            </div>
          )}
        </section>

        <section id="evidence-chain" tabIndex={-1} className="tb-section tb-evidence" data-showcase="evidence-chain">
          <div className="tb-section__intro">
            <h2>{t("这些机制，有哪些可复核的依据？")}</h2>
            <p>{t("合成测试检验指定样例上的行为，不衡量教学效果。报告通过，也不等于真实模型质量或儿童使用条件已通过。")}</p>
          </div>
          <p className="tb-report-status" role="status">{behaviorReport && ragReport ? (allGatesPass ? t("合成机制检查通过") : t("合成机制检查未通过")) : error ? t("报告不可用，未作通过判断") : t("报告读取中")}</p>
          <GitCommit className="tb-evidence__icon" aria-hidden="true" />
          <div className="tb-evidence__scoreboard">
            <div><span>{t("对话规则合成用例")}</span><strong>{behaviorReport ? `${behaviorReport.summary.matched}/${behaviorReport.summary.total}` : 'n/a'}</strong><small>sourceDirty={behaviorReport ? String(behaviorReport.sourceDirty) : 'unknown'} / {shortHash(behaviorReport?.sourceCommit)}</small></div>
            <div><span>{t("检索机制合成用例")}</span><strong>{ragReport ? `${ragReport.summary.passed}/${ragReport.summary.total}` : 'n/a'}</strong><small>sourceDirty={ragReport ? String(ragReport.sourceDirty) : 'unknown'} / {shortHash(ragReport?.sourceCommit)}</small></div>
          </div>
          {behaviorReport && (
            <dl className="tb-evidence__metrics">
              {Object.entries(behaviorReport.gate.metrics).map(([key, value]) => (
                <div key={key}><dt>{t(METRIC_LABELS[key] ?? key)}</dt><dd>{percent(value)}</dd></div>
              ))}
            </dl>
          )}
        </section>

        <section className="tb-section tb-gateway" data-showcase="llm-gateway">
          <div className="tb-section__title"><Network aria-hidden="true" /><h2>{t("报告里的模型调用，来自离线假模型")}</h2></div>
          <dl>
            <div><dt>{t("提供方")}</dt><dd>{ragReport?.showcase.llmGateway.providerId ?? '—'}</dd></div>
            <div><dt>{t("模型")}</dt><dd>{ragReport?.showcase.llmGateway.model ?? '—'}</dd></div>
            <div><dt>{t("模式 / 结束原因")}</dt><dd>{ragReport?.showcase.llmGateway.mode ?? '—'} / {ragReport?.showcase.llmGateway.finishReason ?? '—'}</dd></div>
            <div><dt>{t("超时")}</dt><dd>{ragReport ? (ragReport.showcase.llmGateway.timedOut ? t("是") : t("否")) : '—'}</dd></div>
          </dl>
          <p><LockKeyhole size={16} aria-hidden="true" /> {t("该离线测试的真实模型调用：")} {ragReport?.scope.productionModelCalls ?? '—'}{t("；网络调用：")} {ragReport?.scope.networkCalls ?? '—'}{t("。浏览器只读取同源静态报告，不持有模型密钥。")}</p>
        </section>

          <div className="tb-report-links"><a href={demoAsset('eval-report.json')} target="_blank" rel="noreferrer">{t("对话规则 JSON")}</a><a href={demoAsset('rag-eval-report.json')} target="_blank" rel="noreferrer">{t("检索机制 JSON")}</a><a href={demoAsset('practice-eval-report.json')} target="_blank" rel="noreferrer">{t("练习流程 JSON")}</a></div>
        </details>

        <div className="tb-boundary">
        <section className="tb-limitations">
          <ShieldCheck aria-hidden="true" />
          <div><h2>{t("这次体验的边界")}</h2><p>{t("它展示成人扮演学习者的预设流程，不代表已经验证教学效果，也不提供三科实时 AI 辅导。真实模型质量、儿童使用、隐私与资料授权仍需另行验证。")}</p></div>
        </section>

          <dl className="tb-contract-strip">
            <div><dt>{t("真实运行")}</dt><dd>{t("答题判定、流程推进、本地进度")}</dd></div>
            <div><dt>{t("预设模拟")}</dt><dd>{t("教学提示、对话与检索案例")}</dd></div>
            <div><dt>{t("本演示未接入")}</dt><dd>{t("模型、账号、拍照、语音服务")}</dd></div>
          </dl>
        </div>

        <footer className="tb-footer">
          <p>{t("ThinkBud · 把得到帮助与独立完成分开看。")}</p>
          <a href="https://github.com/Jeffreyliu0131/thinkbud-ai" target="_blank" rel="noreferrer">{t("查看项目源码")}<ArrowUpRight size={16} aria-hidden="true" /></a>
        </footer>
      </div>
    </main>
  )
}
