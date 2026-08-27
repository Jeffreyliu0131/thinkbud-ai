import { useEffect, useState } from 'react'
import { CheckCircle2, FlaskConical, ShieldCheck, TriangleAlert } from 'lucide-react'

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

const SYNTHETIC_TRANSCRIPT = [
  { role: 'student', text: '我不会算 12-5。' },
  { role: 'coach', text: '没关系，先圈出12。你想先拿走几个？' },
  { role: 'student', text: '先拿走2，就剩10。' },
  { role: 'coach', text: '你已经拿走2了。还需要再拿走几个？' },
]

const LABELS: Record<string, string> = {
  positiveControlPassRate: '合规正例通过率',
  negativeControlDetectionRecall: '坏例检出率',
  inputSafetyAccuracy: '输入污染检查',
  failureRecoveryAccuracy: '故障恢复策略',
  telemetryBudgetAccuracy: '延迟/成本预算',
}

export default function SyntheticDemoPage() {
  const [report, setReport] = useState<EvalReport | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/eval-report.json', { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error('missing report')
        return response.json() as Promise<EvalReport>
      })
      .then(setReport)
      .catch(() => setError(true))
  }, [])

  return (
    <main className="min-h-full overflow-auto bg-[#f4f8f5] text-[#17352f]">
      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-12">
        <div className="mb-7 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <FlaskConical className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
          <p><strong>完全合成的演示。</strong>没有真实儿童、家庭、教师或生产数据，也没有调用生产模型或付费 API。对话文案是演示脚本，不是用户证言。</p>
        </div>

        <header className="mb-10 grid gap-6 md:grid-cols-[1.5fr_1fr] md:items-end">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-teal-700">ThinkBud evidence mode</p>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">从产品原则到可执行发布门禁</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#526f68]">核心问题不是“模型看起来聪明吗”，而是：它有没有泄露答案、下一问是否可行动、受污染输入和语音故障是否被确定性处理。</p>
          </div>
          <div className={`rounded-3xl border p-6 ${report?.gate.passed ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
            <div className="flex items-center gap-3">
              {report?.gate.passed
                ? <CheckCircle2 className="text-emerald-700" size={30} aria-hidden="true" />
                : <TriangleAlert className="text-rose-700" size={30} aria-hidden="true" />}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#607a73]">Deterministic gate</p>
                <p className="text-3xl font-bold">{report ? (report.gate.passed ? 'PASS' : 'FAIL') : 'LOADING'}</p>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <section className="mb-6 rounded-2xl border border-rose-200 bg-white p-5">
            <p className="font-bold text-rose-800">找不到实际运行结果。</p>
            <p className="mt-1 text-sm text-[#607a73]">先运行 <code className="rounded bg-gray-100 px-1 py-0.5">npm run evidence</code>，再刷新此页。</p>
          </section>
        )}

        {report && (
          <section aria-label="评估指标" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(report.gate.metrics).map(([key, value]) => (
              <article key={key} className="rounded-2xl border border-[#dce9e2] bg-white p-5 shadow-sm">
                <p className="min-h-10 text-sm text-[#607a73]">{LABELS[key] ?? key}</p>
                <p className="mt-2 text-3xl font-bold text-teal-800">{Math.round(value * 100)}%</p>
              </article>
            ))}
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-[#dce9e2] bg-white p-6 shadow-sm md:p-8">
            <div className="mb-6 flex items-center gap-3">
              <ShieldCheck className="text-teal-700" aria-hidden="true" />
              <div><h2 className="text-xl font-bold">合成对话切片</h2><p className="text-sm text-[#607a73]">展示“安抚 + 单一认知动作 + 不给答案”</p></div>
            </div>
            <div className="space-y-4">
              {SYNTHETIC_TRANSCRIPT.map((turn, index) => (
                <div key={`${turn.role}-${index}`} className={`flex ${turn.role === 'student' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${turn.role === 'student' ? 'bg-[#17352f] text-white' : 'bg-teal-50 text-[#17352f]'}`}>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wider opacity-60">{turn.role === 'student' ? 'Synthetic learner' : 'Curated coach'}</p>
                    <p>{turn.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-[#dce9e2] bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-xl font-bold">可审查证据</h2>
            <dl className="mt-6 space-y-4 text-sm">
              <div className="flex justify-between gap-4 border-b border-gray-100 pb-3"><dt className="text-[#607a73]">合成用例</dt><dd className="font-bold">{report?.summary.total ?? '—'}</dd></div>
              <div className="flex justify-between gap-4 border-b border-gray-100 pb-3"><dt className="text-[#607a73]">预期匹配</dt><dd className="font-bold">{report ? `${report.summary.matched}/${report.summary.total}` : '—'}</dd></div>
              <div className="flex justify-between gap-4 border-b border-gray-100 pb-3"><dt className="text-[#607a73]">生产模型调用</dt><dd className="font-bold">{report?.scope.productionModelCalls ?? '—'}</dd></div>
              <div className="flex justify-between gap-4 border-b border-gray-100 pb-3"><dt className="text-[#607a73]">真实儿童记录</dt><dd className="font-bold">{report?.scope.realChildRecords ?? '—'}</dd></div>
              <div className="flex justify-between gap-4 border-b border-gray-100 pb-3"><dt className="text-[#607a73]">人工盲评</dt><dd className="font-bold">{report?.scope.humanReviewStatus ?? '—'}</dd></div>
            </dl>
            <div className="mt-6 rounded-2xl bg-gray-50 p-4 text-xs leading-5 text-[#607a73]">
              <p>Commit: <code className="break-all">{report?.sourceCommit ?? '—'}</code></p>
              <p>Snapshot: <code className="break-all">{report?.sourceSnapshotHash ?? '—'}</code>{report?.sourceDirty ? ' (uncommitted isolated clone)' : ''}</p>
              <p>Dataset: <code className="break-all">{report?.datasetHash ?? '—'}</code></p>
            </div>
          </section>
        </div>

        <section className="mt-8 rounded-3xl bg-[#17352f] p-7 text-white md:p-9">
          <h2 className="text-2xl font-bold">门禁的诚实边界</h2>
          <p className="mt-3 max-w-3xl leading-7 text-emerald-50">确定性门禁通过，只说明安全规则、坏例检出、输入过滤、故障恢复和预算判定按预期工作。任何真实模型版本上线前，仍必须生成新输出并完成双人盲评；模型 judge 只能作为辅助，不能覆盖安全硬失败。</p>
        </section>
      </div>
    </main>
  )
}
