import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { Session, GradeLevel } from '../types'
import { GRADE_LABELS } from '../types'
import { getAllSessions } from '../lib/db'
import { SkeletonCard } from '../components/shared/Skeleton'
import BudMascot from '../components/BudMascot'

interface HistoryPageState {
  returnTo?: { resumeSessionId: string; gradeLevel: GradeLevel }
}

/** 判断会话是否需要复习（有挣扎或未解决） */
function needsReview(session: Session): boolean {
  if (!session.resolved) return true
  const a = session.analytics
  if (!a) return false
  return a.resolutionType === 'guided' && a.hintCount >= 5
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as HistoryPageState)?.returnTo
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    getAllSessions()
      .then(setSessions)
      .finally(() => setLoading(false))
  }, [])

  // 焦点管理：页面加载后聚焦主内容区
  useEffect(() => {
    if (!loading) mainRef.current?.focus()
  }, [loading])

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const getPreview = (session: Session) => {
    const firstUserMsg = session.messages.find((m) => m.role === 'user')
    if (!firstUserMsg) return '（无内容）'
    const text = firstUserMsg.content.replace(/^\[.*?\]\n?/, '')
    return text.length > 40 ? text.slice(0, 40) + '...' : text
  }

  return (
    <div className="relative flex flex-col h-full bg-[var(--color-bg-primary)] page-enter-right">
      {/* 装饰背景 */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-teal-200/[0.07] blur-3xl" />
        <div className="absolute top-1/2 -left-12 w-44 h-44 rounded-full bg-amber-200/[0.06] blur-3xl" />
        <div className="absolute bottom-10 right-8 w-32 h-32 rounded-full bg-emerald-200/[0.05] blur-2xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center px-4 py-3 shrink-0 md:px-8" style={{ paddingTop: 'max(0.75rem, var(--safe-top))' }}>
        <button
          onClick={() => {
            if (returnTo) {
              navigate('/chat', { state: returnTo })
            } else {
              navigate('/')
            }
          }}
          aria-label="返回"
          className="text-[var(--color-text-secondary)] hover:text-teal-600 mr-3 text-xl transition-colors p-2 -ml-2 min-w-[3rem] min-h-[3rem] flex items-center justify-center"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-bold text-[var(--color-text-primary)]">历史记录</h1>
      </header>

      {/* 内容区 */}
      <main
        ref={mainRef}
        tabIndex={-1}
        className="relative z-10 flex-1 overflow-y-auto px-4 py-4 md:px-8 outline-none"
        aria-label="历史记录列表"
      >
        {/* 骨架屏加载态 */}
        {loading && (
          <div className="space-y-3 max-w-lg mx-auto" role="status" aria-label="加载中">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <span className="sr-only">正在加载历史记录...</span>
          </div>
        )}

        {/* 空状态 */}
        {!loading && sessions.length === 0 && (
          <div className="text-center mt-20 animate-fade-up">
            <div className="w-20 mx-auto mb-3" aria-hidden="true">
              <BudMascot animate="wave" speechBubble="还没有学习记录，去挑战第一道题吧！" />
            </div>
            <button
              onClick={() => navigate('/')}
              className="mt-4 px-6 py-2.5 bg-teal-500 text-white rounded-[var(--radius-pill)] text-sm font-bold hover:bg-teal-600 active:scale-[0.98] transition-all shadow-md btn-3d btn-3d-teal"
            >
              开始学习
            </button>
          </div>
        )}

        {/* 会话列表 */}
        {!loading && sessions.length > 0 && (
          <div className="space-y-3 max-w-lg mx-auto">
            {sessions.map((session, i) => (
              <article
                key={session.id}
                className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-4 border border-[#E8DDD3] shadow-sm hover:shadow-md hover:border-teal-200 animate-fade-up transition-all"
                style={{ animationDelay: `${i * 60}ms` }}
                aria-label={`${GRADE_LABELS[session.gradeLevel]}会话，${getPreview(session)}`}
              >
                {/* 顶部：标签 + 时间 */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-teal-600 font-bold bg-teal-50 px-2 py-0.5 rounded-full">
                      {GRADE_LABELS[session.gradeLevel]}
                    </span>
                    {needsReview(session) && (
                      <span className="text-xs text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full">
                        需复习
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {formatDate(session.updatedAt)}
                  </span>
                </div>

                {/* 预览文字 */}
                <p className="text-sm text-[var(--color-text-primary)] leading-relaxed">{getPreview(session)}</p>

                {/* 底部：统计 + 策略 */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {session.messages.length} 条消息
                  </span>
                  {session.resolved && (
                    <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold">
                      已解决
                    </span>
                  )}
                  {session.analytics?.strategiesUsed?.map((s) => (
                    <span
                      key={s}
                      className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() =>
                      navigate('/chat', {
                        state: {
                          gradeLevel: session.gradeLevel,
                          resumeSessionId: session.id,
                        },
                      })
                    }
                    aria-label={`继续对话：${getPreview(session)}`}
                    className="flex-1 text-xs text-teal-600 bg-teal-50/80 py-2 rounded-[var(--radius-pill)] font-bold active:scale-95 transition-all hover:bg-teal-100/80 min-h-[3rem] flex items-center justify-center"
                  >
                    继续对话
                  </button>
                  <button
                    onClick={() =>
                      navigate('/conversation', {
                        state: { sessionId: session.id },
                      })
                    }
                    aria-label={`查看对话详情：${getPreview(session)}`}
                    className="flex-1 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] py-2 rounded-[var(--radius-pill)] font-bold active:scale-95 transition-all hover:bg-[#F5EDE4] min-h-[3rem] flex items-center justify-center"
                  >
                    查看对话
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
