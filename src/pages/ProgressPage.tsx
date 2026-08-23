import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import BudMascot from '../components/BudMascot'
import { useProgressData, SUBJECT_COLORS, SUBJECT_LABELS } from '../hooks/useProgressData'

// ===== Helpers =====

const STAR_TEXT_COLORS: Record<string, string> = {
  math: 'text-teal-500',
  chinese: 'text-amber-500',
  english: 'text-violet-500',
}

function StarRating({ stars, subject, upgraded }: { stars: 1 | 2 | 3; subject: string; upgraded?: boolean }) {
  const colorClass = STAR_TEXT_COLORS[subject] ?? 'text-teal-500'
  return (
    <span
      className={`text-lg ${colorClass}${upgraded ? ' star-upgrade' : ''}`}
      aria-label={`${stars}颗星`}
    >
      {'★'.repeat(stars)}{'☆'.repeat(3 - stars)}
    </span>
  )
}

function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// ===== Main Component =====

export default function ProgressPage() {
  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)
  const {
    data, sessions, loading, isEmpty, coldStartLevel,
    totalPoints, masteredCount, exploringCount,
    mascotGreeting, defaultSubject, upgrades,
  } = useProgressData()

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const activeSubject = selectedSubject ?? defaultSubject ?? ''

  useEffect(() => {
    if (!loading) mainRef.current?.focus()
  }, [loading])

  const activePoints = data?.subjects[activeSubject]?.points ?? []

  const isUpgraded = (concept: string): boolean =>
    upgrades.some(u => u.concept === concept)

  // For coldStartLevel 1, flatten all points across subjects
  const allPointsFlat = data
    ? Object.entries(data.subjects).flatMap(([subj, sp]) =>
        sp.points.map(p => ({ ...p, subject: subj }))
      )
    : []

  const subjectKeys = ['math', 'chinese', 'english'] as const

  return (
    <div className="relative flex flex-col h-full bg-[var(--color-bg-primary)] page-enter-left">
      {/* Decorative blurred circles */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-teal-200/[0.07] blur-3xl" />
        <div className="absolute top-1/2 -left-12 w-44 h-44 rounded-full bg-amber-200/[0.06] blur-3xl" />
        <div className="absolute bottom-10 right-8 w-32 h-32 rounded-full bg-emerald-200/[0.05] blur-2xl" />
      </div>

      {/* Header */}
      <header
        className="sticky top-0 z-10 flex items-center px-4 py-3 bg-[var(--color-bg-primary)] md:px-8"
        style={{ paddingTop: 'max(0.75rem, var(--safe-top))' }}
      >
        <button
          onClick={() => navigate('/')}
          aria-label="返回"
          className="text-[var(--color-text-secondary)] hover:text-teal-600 mr-3 text-xl transition-colors p-2 -ml-2 min-w-[3rem] min-h-[3rem] flex items-center justify-center"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">我的学习进度</h1>
      </header>

      {/* Content */}
      <main
        ref={mainRef}
        tabIndex={-1}
        className="relative z-10 flex-1 overflow-y-auto px-4 py-4 md:px-8 outline-none"
        aria-label="我的学习进度"
      >
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-3 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state (coldStartLevel 0) */}
        {!loading && isEmpty && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-up">
            <div className="w-24 mb-4">
              <BudMascot
                animate="wave"
                speechBubble="去和 AI 教练聊一道题吧！"
              />
            </div>
            <button
              onClick={() => navigate('/')}
              aria-label="开始学习"
              className="mt-4 px-8 py-3 text-base font-bold bg-teal-500 text-white btn-3d btn-3d-teal"
            >
              开始学习
            </button>
          </div>
        )}

        {/* Data state (coldStartLevel >= 1) */}
        {!loading && !isEmpty && data && (
          <>
            {/* Mascot greeting */}
            <div
              className="flex flex-col items-center mb-4 animate-fade-up"
              style={{ animationDelay: '0ms' }}
            >
              <div className="w-20">
                <BudMascot
                  emotion="happy"
                  speechBubble={mascotGreeting}
                />
              </div>
            </div>

            {/* Stat cards row */}
            <div
              className="grid grid-cols-3 gap-2 mb-4 animate-fade-up"
              style={{ animationDelay: '100ms' }}
            >
              <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-[#E8DDD3] p-3 text-center">
                <div className="text-[28px] font-bold text-teal-600 leading-tight">
                  {totalPoints}
                </div>
                <div className="text-xs font-bold text-[var(--color-text-secondary)]">
                  个知识点
                </div>
              </div>
              <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-[#E8DDD3] p-3 text-center">
                <div className="text-[28px] font-bold text-teal-600 leading-tight">
                  {masteredCount}
                </div>
                <div className="text-xs font-bold text-[var(--color-text-secondary)] flex items-center justify-center gap-1">
                  <span className="text-amber-400 text-sm">★★★</span> 已熟练
                </div>
              </div>
              <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-[#E8DDD3] p-3 text-center">
                <div className="text-[28px] font-bold text-teal-600 leading-tight">
                  {exploringCount}
                </div>
                <div className="text-xs font-bold text-[var(--color-text-secondary)] flex items-center justify-center gap-1">
                  <span className="text-amber-400 text-sm">★☆☆</span> 探索中
                </div>
              </div>
            </div>

            {/* Subject tab bar -- only show at coldStartLevel >= 2 */}
            {coldStartLevel >= 2 && (
              <div
                className="flex border-b border-[#E8DDD3] mb-4 animate-fade-up"
                style={{ animationDelay: '200ms' }}
                role="tablist"
              >
                {subjectKeys.map(key => {
                  const isActive = activeSubject === key
                  const borderColor = key === 'math' ? 'border-teal-500'
                    : key === 'chinese' ? 'border-amber-500'
                    : 'border-violet-500'
                  return (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setSelectedSubject(key)}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                        isActive
                          ? `${borderColor} text-[var(--color-text-primary)] font-bold`
                          : 'border-transparent text-[var(--color-text-muted)]'
                      }`}
                    >
                      {SUBJECT_LABELS[key]}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Knowledge point list */}
            <div
              className="space-y-2 mb-6 animate-fade-up"
              style={{ animationDelay: coldStartLevel >= 2 ? '300ms' : '200ms' }}
              role="list"
            >
              {coldStartLevel === 1 ? (
                // Flat list without tabs
                allPointsFlat.length > 0 ? (
                  allPointsFlat.map((point, i) => (
                    <div
                      key={point.concept}
                      className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-[#E8DDD3] p-3 flex items-center gap-3 animate-fade-up"
                      style={{ animationDelay: i < 5 ? `${i * 80}ms` : '0ms' }}
                      role="listitem"
                    >
                      <StarRating stars={point.stars} subject={point.subject} upgraded={isUpgraded(point.concept)} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">{point.label}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{point.starLabel}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-sm text-[var(--color-text-muted)] py-8">
                    继续学习，知识点会在这里出现
                  </div>
                )
              ) : (
                // Tabbed list
                activePoints.length > 0 ? (
                  activePoints.map((point, i) => (
                    <div
                      key={point.concept}
                      className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-[#E8DDD3] p-3 flex items-center gap-3 animate-fade-up"
                      style={{ animationDelay: i < 5 ? `${i * 80}ms` : '0ms' }}
                      role="listitem"
                    >
                      <StarRating stars={point.stars} subject={activeSubject} upgraded={isUpgraded(point.concept)} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">{point.label}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{point.starLabel}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-sm text-[var(--color-text-muted)] py-8">
                    还没有{SUBJECT_LABELS[activeSubject]}的知识点，去探索一下吧！
                  </div>
                )
              )}
            </div>

            {/* Recent session cards */}
            {sessions.length > 0 && (
              <div className="mb-6 animate-fade-up" style={{ animationDelay: '400ms' }}>
                <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-3">最近学习</h2>
                <div
                  className="overflow-x-auto flex gap-3 pb-2 snap-x snap-mandatory"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {sessions.map(session => (
                    <div
                      key={session.id}
                      className="min-w-[140px] snap-start bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-[#E8DDD3] p-3 shrink-0"
                    >
                      <div className="text-xs text-[var(--color-text-muted)] mb-1.5">
                        {formatSessionDate(session.date)}
                      </div>
                      {session.subject && (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs text-white mb-1.5 ${SUBJECT_COLORS[session.subject] ?? 'bg-gray-400'}`}>
                          {SUBJECT_LABELS[session.subject] ?? session.subject}
                        </span>
                      )}
                      {session.topic && (
                        <div className="text-sm text-[var(--color-text-primary)] truncate">
                          {session.topic}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
