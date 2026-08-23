import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { Session } from '../types'
import { GRADE_LABELS, EMOTION_EMOJI } from '../types'
import { getSession } from '../lib/db'
import { SkeletonMessage } from '../components/shared/Skeleton'

export default function ConversationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const sessionId = (location.state as { sessionId?: string })?.sessionId
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!sessionId) return
    getSession(sessionId)
      .then((s) => setSession(s ?? null))
      .finally(() => setLoading(false))
  }, [sessionId])

  // 焦点管理：加载完成后聚焦主内容
  useEffect(() => {
    if (!loading) mainRef.current?.focus()
  }, [loading])

  if (!sessionId) return <Navigate to="/history" replace />

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const formatFullDate = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="relative flex flex-col h-full bg-[var(--color-bg-primary)]">
      {/* 装饰背景 */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-teal-200/[0.07] blur-3xl" />
        <div className="absolute top-1/2 -left-12 w-44 h-44 rounded-full bg-amber-200/[0.06] blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center px-4 py-3 shrink-0 md:px-8">
        <button
          onClick={() => navigate('/history')}
          aria-label="返回历史记录"
          className="text-[var(--color-text-secondary)] hover:text-teal-600 mr-3 text-xl transition-colors p-2 -ml-2 min-w-[3rem] min-h-[3rem] flex items-center justify-center"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">对话详情</h1>
          {session && (
            <p className="text-xs text-[var(--color-text-muted)]">
              {GRADE_LABELS[session.gradeLevel]} · {formatFullDate(session.createdAt)}
            </p>
          )}
        </div>
      </header>

      {/* 内容区 */}
      <main
        ref={mainRef}
        tabIndex={-1}
        className="relative z-10 flex-1 overflow-y-auto px-4 py-4 md:px-8 outline-none"
        aria-label="对话消息"
      >
        {/* 骨架屏加载态 */}
        {loading && (
          <div className="max-w-lg mx-auto space-y-3" role="status" aria-label="加载中">
            <SkeletonMessage />
            <SkeletonMessage isUser />
            <SkeletonMessage />
            <SkeletonMessage isUser />
            <SkeletonMessage />
            <span className="sr-only">正在加载对话内容...</span>
          </div>
        )}

        {/* 未找到会话 */}
        {!loading && !session && (
          <div className="text-center mt-20 animate-fade-up">
            <p className="text-[var(--color-text-muted)] text-sm">未找到该对话记录</p>
            <button
              onClick={() => navigate('/history')}
              className="mt-3 text-sm text-teal-500 hover:text-teal-600 font-medium"
            >
              返回历史记录
            </button>
          </div>
        )}

        {session && (
          <div className="max-w-lg mx-auto space-y-4">
            {/* 分析卡片 */}
            {session.analytics && (
              <section className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-[#E8DDD3] p-4 mb-4 animate-fade-up" aria-label="学习分析">
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-teal-600">{session.analytics.hintCount}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">次提示</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-purple-600">
                      {session.analytics.resolutionType === 'independent' ? '独立' :
                       session.analytics.resolutionType === 'guided' ? '引导' : '未解决'}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">解题方式</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-600">{session.analytics.strategiesUsed.length}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">种策略</p>
                  </div>
                </div>
                {session.analytics.strategiesUsed.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {session.analytics.strategiesUsed.map((s) => (
                      <span key={s} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* 消息列表 — 平铺排版 (D-14) */}
            {session.messages.map((msg, i) => {
              const isUser = msg.role === 'user'
              // 跳过系统指令（[学生表示...] 开头的隐藏消息）
              if (isUser && msg.content.startsWith('[')) return null

              return (
                <div
                  key={msg.id}
                  className="animate-fade-up"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {isUser ? (
                    /* 用户消息：卡片背景 */
                    <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] px-4 py-3">
                      <p className="text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1.5">{formatTime(msg.timestamp)}</p>
                    </div>
                  ) : (
                    /* AI 消息：无气泡，平铺左对齐 */
                    <div className="py-1">
                      {msg.emotion && msg.emotion !== '正常' && (
                        <span className="text-xs text-[var(--color-text-muted)] mb-1 block">
                          {EMOTION_EMOJI[msg.emotion]} {msg.emotion}
                        </span>
                      )}
                      <p className="text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1.5">{formatTime(msg.timestamp)}</p>
                    </div>
                  )}
                </div>
              )
            })}

            {/* 底部留白 */}
            <div className="h-8" />
          </div>
        )}
      </main>
    </div>
  )
}
