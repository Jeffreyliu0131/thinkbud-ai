import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import BudMascot from '../components/BudMascot'
import { Accordion } from '../components/shared/Accordion'
import { SkeletonReassurance, SkeletonAccordion } from '../components/shared/Skeleton'
import { fetchWithTimeout } from '../lib/api'
import { getColdStartState, confidenceToLabel } from '../types/parent'
import type { ParentReport, ColdStartState } from '../types/parent'
import type { ChildProgressResponse } from '../types/child'

type TimeRange = '7d' | '30d' | 'all'

const RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '7天' },
  { value: '30d', label: '30天' },
  { value: 'all', label: '全部' },
]

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学',
  chinese: '语文',
  english: '英语',
}

const SUBJECT_COLORS: Record<string, string> = {
  math: 'bg-teal-500',
  chinese: 'bg-amber-500',
  english: 'bg-violet-500',
}

const MASTERY_COLORS: Record<string, string> = {
  low: 'text-amber-600',
  mid: 'text-teal-600',
  high: 'text-emerald-600',
}

const RESOLUTION_STYLES: Record<string, string> = {
  independent: 'bg-emerald-50 text-emerald-600',
  guided: 'bg-amber-50 text-amber-600',
}

function formatSubjectLabel(subject: string | null): string {
  if (!subject) return ''
  return SUBJECT_LABELS[subject] ?? subject
}

export default function ParentPage() {
  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)
  const [report, setReport] = useState<ParentReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<TimeRange>('7d')
  const [retryCount, setRetryCount] = useState(0)
  const [progressData, setProgressData] = useState<ChildProgressResponse | null>(null)

  // Fetch knowledge point progress (all-time, not range-dependent)
  useEffect(() => {
    let cancelled = false
    fetchWithTimeout('/api/child/progress', { timeout: 15_000 })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: ChildProgressResponse) => {
        if (!cancelled) setProgressData(data)
      })
      .catch(() => {
        // Silent fail — knowledge points section simply won't show
        // Parent report is the primary content; progress is supplementary
      })
    return () => { cancelled = true }
  }, [retryCount])

  useEffect(() => {
    let cancelled = false
    fetchWithTimeout(`/api/parent/report?range=${range}`, { timeout: 15_000 })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: ParentReport) => {
        if (!cancelled) setReport(data)
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message ?? '未知错误')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [range, retryCount])

  useEffect(() => {
    if (!loading) mainRef.current?.focus()
  }, [loading])

  const coldStart: ColdStartState | null = report ? getColdStartState(report.totalConversations) : null
  const showLayers = coldStart !== 'getting-to-know'

  const handleRangeChange = (nextRange: TimeRange) => {
    if (nextRange === range) return
    setLoading(true)
    setError(null)
    setRange(nextRange)
  }

  const handleRetry = () => {
    setLoading(true)
    setError(null)
    setRetryCount((count) => count + 1)
  }

  // Activity bar chart data (last 7 days)
  const activityBars = report?.dailyActivity?.slice(-7) ?? []
  const maxActivity = Math.max(...activityBars.map((d) => d.count), 1)

  return (
    <div className="relative flex flex-col h-full bg-[var(--color-bg-primary)] page-enter-left">
      {/* Decorative blurred circles */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-teal-200/[0.07] blur-3xl" />
        <div className="absolute top-1/2 -left-12 w-44 h-44 rounded-full bg-amber-200/[0.06] blur-3xl" />
        <div className="absolute bottom-10 right-8 w-32 h-32 rounded-full bg-emerald-200/[0.05] blur-2xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex flex-col px-4 py-3 shrink-0 md:px-8" style={{ paddingTop: 'max(0.75rem, var(--safe-top))' }}>
        <div className="flex items-center">
          <button
            onClick={() => navigate('/')}
            aria-label="返回"
            className="text-[var(--color-text-secondary)] hover:text-teal-600 mr-3 text-xl transition-colors p-2 -ml-2 min-w-[3rem] min-h-[3rem] flex items-center justify-center"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg font-bold text-[var(--color-text-primary)]">家长报告</h1>
        </div>

        {/* Time range pills */}
        <div className="flex gap-2 mt-2" role="tablist" aria-label="时间范围">
          {RANGE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              role="tab"
              aria-selected={range === value}
              onClick={() => handleRangeChange(value)}
              className={`rounded-full px-3 py-1 text-sm font-bold transition-colors min-h-[var(--touch-min)] flex items-center ${
                range === value
                  ? 'bg-teal-50/80 text-teal-600'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main
        ref={mainRef}
        tabIndex={-1}
        className="relative z-10 flex-1 overflow-y-auto px-4 py-4 md:px-8 outline-none"
        aria-label="家长报告内容"
      >
        <div className="max-w-lg mx-auto space-y-4">
          {/* Loading */}
          {loading && (
            <div role="status" aria-label="正在加载家长报告...">
              <SkeletonReassurance />
              <SkeletonAccordion />
              <span className="sr-only">正在加载家长报告...</span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div
              className="bg-red-50 border border-red-200 rounded-[var(--radius-card)] p-4 flex items-start gap-3"
              aria-live="polite"
            >
              <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm text-red-700">报告加载失败，请检查网络后重试</p>
                <button
                  onClick={handleRetry}
                  className="text-sm text-red-600 font-bold underline mt-1"
                >
                  重试
                </button>
              </div>
            </div>
          )}

          {/* Report content */}
          {!loading && !error && report && (
            <>
              {/* Empty state (0 conversations) */}
              {report.totalConversations === 0 && (
                <div className="text-center mt-12 animate-fade-up">
                  <div className="w-24 mx-auto mb-3">
                    <BudMascot animate="wave" speechBubble="还没有学习记录，去和 AI 教练聊一道题吧！" />
                  </div>
                  <button
                    onClick={() => navigate('/')}
                    className="mt-4 px-6 py-3 bg-teal-500 text-white text-sm font-bold btn-3d btn-3d-teal"
                  >
                    开始学习
                  </button>
                </div>
              )}

              {/* Layer 1: Reassurance (always visible when totalConversations > 0) */}
              {report.totalConversations > 0 && coldStart === 'getting-to-know' && (
                <div className="bg-[var(--color-bg-card)] border border-teal-100 rounded-[var(--radius-card)] p-4 animate-fade-up">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-14 shrink-0">
                      <BudMascot emotion="curious" speechBubble="ThinkBud 正在认识你的孩子" />
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-xl font-bold text-[var(--color-text-primary)]">
                        已完成 {report.totalConversations} 次对话，再多几次就能看到学习报告了
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {report.totalConversations > 0 && showLayers && (
                <>
                  {/* Layer 1: Full reassurance */}
                  <div
                    className="bg-[var(--color-bg-card)] border border-teal-100 rounded-[var(--radius-card)] p-4 animate-fade-up"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-14 shrink-0">
                        <BudMascot emotion="happy" />
                      </div>
                      <p className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)] pt-1">
                        {report.childName ?? '小朋友'}这周学习了 {report.reassurance.weeklyCount} 次，{report.reassurance.narrative}！
                      </p>
                    </div>

                    {/* Activity bar chart (7 days) */}
                    <div
                      role="img"
                      aria-label={`本周活跃度：${activityBars.map((d, i) => `周${DAY_NAMES[i] ?? '?'}${d.count}次`).join('，')}`}
                    >
                      <div className="flex items-end gap-1 h-10">
                        {activityBars.map((d) => (
                          <div
                            key={d.date}
                            className={`flex-1 rounded-t ${
                              d.count > 0 ? 'bg-teal-400' : 'bg-gray-100'
                            }`}
                            style={{
                              height: `${Math.max(4, (d.count / maxActivity) * 32)}px`,
                              borderRadius: '4px 4px 0 0',
                            }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {activityBars.map((d, i) => (
                          <span key={d.date} className="flex-1 text-center text-xs text-[var(--color-text-muted)]">
                            {DAY_NAMES[i] ?? ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Layer 2: Strategy Toolbox */}
                  <Accordion title="学习概览" defaultOpen>
                    {/* Stat cards: 2x2 grid */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <StatCard value={String(report.stats.totalSessions)} label="总学习次数" />
                      <StatCard value={`${Math.round(report.stats.avgDurationMinutes)}分钟`} label="平均时长" />
                      <StatCard value={`${Math.round(report.stats.independenceRate)}%`} label="独立解决率" />
                      <StatCard value={formatSubjectLabel(report.stats.mostPracticedSubject) || '--'} label="最常练习" />
                    </div>

                    {/* Subject progress bars */}
                    {report.subjectProgress.length > 0 && (
                      <div className="space-y-3 mb-4">
                        {report.subjectProgress.map((sp) => {
                          const mastery = confidenceToLabel(sp.avgConfidence)
                          return (
                            <div key={sp.subject}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-[var(--color-text-primary)]">
                                  {formatSubjectLabel(sp.subject)}
                                </span>
                                <span className={`text-xs font-bold ${MASTERY_COLORS[mastery.level]}`}>
                                  {mastery.label}
                                </span>
                              </div>
                              <div className="bg-gray-100 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${SUBJECT_COLORS[sp.subject] ?? 'bg-teal-500'}`}
                                  style={{ width: `${Math.max(8, sp.avgConfidence * 100)}%`, minWidth: '8px' }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Weak points */}
                    {report.weakPoints.length > 0 && (
                      <div className="space-y-2">
                        {report.weakPoints.slice(0, 3).map((wp, i) => (
                          <span
                            key={i}
                            className="inline-block bg-amber-50 rounded-full px-2 py-0.5 text-sm text-[var(--color-text-secondary)] mr-2"
                          >
                            正在探索 {wp.concept}
                          </span>
                        ))}
                      </div>
                    )}
                  </Accordion>

                  {/* Knowledge Point Mastery (only at concept-level cold start) */}
                  {progressData && coldStart === 'concept-level' && (() => {
                    const allSubjects = Object.entries(progressData.subjects)
                    const hasAnyPoints = allSubjects.some(([, sp]) => sp.points.length > 0)

                    // Collect all 1-star weak points across subjects
                    const weakPoints = allSubjects.flatMap(
                      ([subject, sp]) => sp.points
                        .filter(p => p.stars === 1)
                        .map(p => ({ ...p, subject }))
                    )

                    return (
                      <Accordion title="知识点掌握">
                        {!hasAnyPoints ? (
                          <p className="text-sm text-[var(--color-text-muted)]">还没有知识点数据</p>
                        ) : (
                          <>
                            {/* Weak points block */}
                            {weakPoints.length > 0 && (
                              <div className="mb-4">
                                <p className="text-sm font-bold text-amber-700 mb-2">需要关注</p>
                                <div className="space-y-2">
                                  {weakPoints.map((p, i) => (
                                    <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-bold text-[var(--color-text-primary)]">{p.label}</span>
                                        <span className="text-xs text-[var(--color-text-muted)]">
                                          {SUBJECT_LABELS[p.subject] ?? p.subject}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-amber-400">{'★'.repeat(p.stars) + '☆'.repeat(3 - p.stars)}</span>
                                        <span className="text-xs text-amber-600">可以多练习这类题</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Subject sections */}
                            {allSubjects
                              .filter(([, sp]) => sp.points.length > 0)
                              .map(([subjectKey, sp]) => {
                                const mastered = sp.points.filter(p => p.stars === 3).length
                                const inProgress = sp.points.filter(p => p.stars === 2).length
                                const exploring = sp.points.filter(p => p.stars === 1).length
                                return (
                                  <div key={subjectKey} className="mb-4 last:mb-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`w-2 h-2 rounded-full ${SUBJECT_COLORS[subjectKey] ?? 'bg-gray-400'}`} />
                                      <span className="text-sm font-bold text-[var(--color-text-primary)]">
                                        {SUBJECT_LABELS[subjectKey] ?? subjectKey}
                                      </span>
                                    </div>
                                    <p className="text-xs text-[var(--color-text-muted)] mb-2">
                                      已熟练 {mastered} · 进行中 {inProgress} · 探索中 {exploring}
                                    </p>
                                    <div className="space-y-1.5">
                                      {sp.points.map((pt) => {
                                        const colorKey = pt.stars === 3 ? 'high' : pt.stars === 2 ? 'mid' : 'low'
                                        return (
                                          <div key={pt.concept} className="flex items-center justify-between py-1">
                                            <span className="text-sm text-[var(--color-text-secondary)]">{pt.label}</span>
                                            <div className="flex items-center gap-2">
                                              <span className="text-amber-400 text-sm">{'★'.repeat(pt.stars) + '☆'.repeat(3 - pt.stars)}</span>
                                              <span className={`text-xs font-bold ${MASTERY_COLORS[colorKey]}`}>{pt.starLabel}</span>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                          </>
                        )}
                      </Accordion>
                    )
                  })()}

                  {/* Layer 3: Highlights */}
                  <Accordion title="精彩瞬间">
                    {report.highlights.length === 0 ? (
                      <p className="text-sm text-[var(--color-text-muted)]">
                        还没有精彩瞬间，再多学几次就有了
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {report.highlights.slice(0, 5).map((hl, i) => (
                          <div key={i}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-[var(--color-text-muted)]">{hl.date}</span>
                              {hl.subject && (
                                <span className="text-xs text-[var(--color-text-muted)]">
                                  {formatSubjectLabel(hl.subject)}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-[var(--color-text-secondary)]">{hl.summary}</p>
                            {hl.highlightQuote && (
                              <blockquote className="border-l-3 border-teal-300 bg-teal-50/40 pl-3 py-2 mt-2 rounded-r">
                                <p className="text-sm italic text-[var(--color-text-primary)]">
                                  {hl.highlightQuote}
                                </p>
                              </blockquote>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Accordion>

                  {/* Layer 4: Detailed Data */}
                  <Accordion title="详细记录">
                    {report.conversations.length === 0 ? (
                      <p className="text-sm text-[var(--color-text-muted)]">暂无对话记录</p>
                    ) : (
                      <div className="space-y-3">
                        {report.conversations.map((conv) => (
                          <button
                            key={conv.id}
                            onClick={() => navigate('/conversation', { state: { sessionId: conv.id } })}
                            className="w-full text-left bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-[#E8DDD3] p-3 hover:shadow-md transition-shadow"
                          >
                            {/* Top line: date + duration + subject */}
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-xs text-[var(--color-text-muted)]">{conv.date}</span>
                              {conv.durationMinutes != null && (
                                <span className="text-xs text-[var(--color-text-muted)]">{Math.round(conv.durationMinutes)}分钟</span>
                              )}
                              {conv.subject && (
                                <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full font-bold">
                                  {formatSubjectLabel(conv.subject)}
                                </span>
                              )}
                            </div>

                            {/* Coach note topic */}
                            {conv.topic && (
                              <p className="text-sm text-[var(--color-text-primary)] line-clamp-1">{conv.topic}</p>
                            )}

                            {/* Tags row */}
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              {conv.strategies.map((s) => (
                                <span key={s} className="bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 text-xs">
                                  {s}
                                </span>
                              ))}
                              {conv.resolutionType && (
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                  RESOLUTION_STYLES[conv.resolutionType] ?? 'bg-gray-100 text-[var(--color-text-secondary)]'
                                }`}>
                                  {conv.resolutionType === 'independent' ? '独立解决' : conv.resolutionType === 'guided' ? '引导解决' : conv.resolutionType}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </Accordion>
                </>
              )}
            </>
          )}

          {/* Bottom spacing */}
          <div className="h-6" />
        </div>
      </main>
    </div>
  )
}

/** Stat card sub-component */
function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-[#E8DDD3] p-3 text-center">
      <p className="text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
      <p className="text-xs font-bold text-[var(--color-text-secondary)]">{label}</p>
    </div>
  )
}
