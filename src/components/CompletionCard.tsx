import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PartyPopper } from 'lucide-react'
import type { ChatMessage } from '../types'
import { EMOTION_EMOJI } from '../types'
import { computeSessionAnalytics } from '../lib/sessionAnalytics'
import BudMascot from './BudMascot'

interface CompletionCardProps {
  messages: ChatMessage[]
  sessionStartTime: number
}

/**
 * 学习完成卡片 — 即时小报告
 * 展示：策略、情绪旅程、交流次数、时长、突破点
 */
export default function CompletionCard({ messages, sessionStartTime }: CompletionCardProps) {
  const navigate = useNavigate()

  const analytics = useMemo(
    () => computeSessionAnalytics(messages, true),
    [messages]
  )

  // 完成时刻的时长快照（组件挂载即完成，不随渲染变化）
  const [durationMin] = useState(() => Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000)))

  const stats = useMemo(() => {
    const totalMessages = messages.filter((m) => m.role === 'user').length

    const hasBreakthrough = analytics.emotionArc.some((e, i) => {
      if (i === 0) return false
      const prev = analytics.emotionArc[i - 1]
      return (prev === '困惑' || prev === '沮丧') && (e === '兴奋' || e === '自信')
    })

    return { totalMessages, durationMin, hasBreakthrough }
  }, [messages, durationMin, analytics.emotionArc])

  // 情绪旅程标签
  const emotionSummary = useMemo(() => {
    const arc = analytics.emotionArc
    if (arc.length === 0) return null
    const first = arc[0]
    const last = arc[arc.length - 1]
    if (first === last) return null
    return `${EMOTION_EMOJI[first] ?? '😊'} ${first} → ${EMOTION_EMOJI[last] ?? '💪'} ${last}`
  }, [analytics.emotionArc])

  // 解题方式标签
  const resolutionLabel = analytics.resolutionType === 'independent'
    ? '独立解决'
    : '引导解决'

  // 挣扎时长（分钟）
  const struggleMin = analytics.struggleDuration
    ? Math.max(1, Math.round(analytics.struggleDuration / 60000))
    : null

  return (
    <section className="animate-fade-up mx-4 mb-6 md:mx-auto md:max-w-md" aria-label="学习完成报告">
      <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-teal-100 shadow-lg p-6">
        {/* 标题 */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-1">
            <BudMascot animate="wave" className="w-12 h-14" speechBubble="太棒了！" />
          </div>
          <h3 className="text-lg font-bold text-[var(--color-text-primary)]">太棒了，搞懂了！</h3>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">{resolutionLabel}</p>
        </div>

        {/* 统计区 */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-teal-50/80 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-teal-600">{stats.totalMessages}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">次交流</p>
          </div>
          <div className="bg-amber-50/80 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.durationMin}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">分钟</p>
          </div>
          <div className="bg-purple-50/80 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-purple-600">{analytics.hintCount}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">次提示</p>
          </div>
        </div>

        {/* 策略标签 */}
        {analytics.strategiesUsed.length > 0 && (
          <div className="bg-blue-50/60 rounded-xl px-4 py-2.5 mb-3">
            <p className="text-xs text-[var(--color-text-secondary)] mb-1.5">使用的策略</p>
            <div className="flex flex-wrap gap-1.5">
              {analytics.strategiesUsed.map((s) => (
                <span
                  key={s}
                  className="text-xs bg-blue-100/80 text-blue-700 px-2 py-0.5 rounded-full"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 情绪旅程 */}
        {emotionSummary && (
          <div className="bg-emerald-50/60 rounded-xl px-4 py-2.5 mb-3 text-center">
            <p className="text-xs text-[var(--color-text-secondary)] mb-0.5">情绪旅程</p>
            <p className="text-sm font-bold text-[var(--color-text-primary)]">{emotionSummary}</p>
          </div>
        )}

        {/* 突破点提示 */}
        {stats.hasBreakthrough && (
          <div className="text-center mb-3">
            <p className="text-xs text-emerald-600">
              <PartyPopper size={14} className="inline mr-1 text-emerald-600" />你经历了一次思维突破！
            </p>
            {struggleMin && (
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                坚持了 {struggleMin} 分钟后找到答案
              </p>
            )}
          </div>
        )}

        {/* 按钮区 */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/tree', { state: { messages } })}
            aria-label="查看思考链"
            className="flex-1 min-h-[var(--touch-min)] bg-[var(--color-bg-card)] border border-teal-200 text-teal-600 py-2.5 rounded-[var(--radius-pill)] text-sm font-bold active:scale-95 transition-all hover:bg-teal-50"
          >
            查看思考链
          </button>
          <button
            onClick={() => navigate('/', { replace: true })}
            aria-label="返回首页"
            className="flex-1 min-h-[var(--touch-min)] bg-teal-500 text-white py-2.5 text-sm font-bold btn-3d btn-3d-teal transition-all"
          >
            返回首页
          </button>
        </div>
      </div>
    </section>
  )
}
