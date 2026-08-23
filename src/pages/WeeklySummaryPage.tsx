import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session, EmotionType } from '../types'
import { EMOTION_EMOJI } from '../types'
import { getAllSessions } from '../lib/db'
import { computeStreak } from '../lib/streak'
import { SkeletonStats } from '../components/shared/Skeleton'

/** 获取本周一 0:00 时间戳 */
function getWeekStart(): number {
  const now = new Date()
  const day = now.getDay() || 7 // 周日=7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1)
  return monday.getTime()
}

/** 获取最近7天的日期标签（周一到今天） */
function getWeekDayLabels(): string[] {
  const labels: string[] = []
  const now = new Date()
  const day = now.getDay() || 7
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + i)
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`)
  }
  return labels
}

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']

export default function WeeklySummaryPage() {
  const navigate = useNavigate()
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    getAllSessions()
      .then(setAllSessions)
      .finally(() => setLoading(false))
  }, [])

  // 焦点管理
  useEffect(() => {
    if (!loading) mainRef.current?.focus()
  }, [loading])

  const weekStart = useMemo(() => getWeekStart(), [])
  const dayLabels = useMemo(() => getWeekDayLabels(), [])

  const weekSessions = useMemo(
    () => allSessions.filter((s) => s.createdAt >= weekStart),
    [allSessions, weekStart]
  )

  const streak = useMemo(() => computeStreak(allSessions), [allSessions])

  // 每日活跃度 (周一=index 0 到周日=index 6)
  const dailyActivity = useMemo(() => {
    const counts = new Array(7).fill(0)
    for (const s of weekSessions) {
      const d = new Date(s.createdAt)
      const dayIdx = (d.getDay() || 7) - 1 // 周一=0
      counts[dayIdx]++
    }
    return counts
  }, [weekSessions])

  // 策略使用统计
  const strategyStats = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of weekSessions) {
      for (const st of s.analytics?.strategiesUsed ?? []) {
        map.set(st, (map.get(st) ?? 0) + 1)
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
  }, [weekSessions])

  // 情绪分布
  const emotionStats = useMemo(() => {
    const map = new Map<EmotionType, number>()
    for (const s of weekSessions) {
      for (const e of s.analytics?.emotionArc ?? []) {
        map.set(e, (map.get(e) ?? 0) + 1)
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
  }, [weekSessions])

  // 解题率
  const resolvedCount = weekSessions.filter((s) => s.resolved).length
  const resolveRate = weekSessions.length > 0
    ? Math.round((resolvedCount / weekSessions.length) * 100)
    : 0

  // 独立解题率
  const independentCount = weekSessions.filter(
    (s) => s.analytics?.resolutionType === 'independent'
  ).length
  const independentRate = resolvedCount > 0
    ? Math.round((independentCount / resolvedCount) * 100)
    : 0

  // 总提示数
  const totalHints = weekSessions.reduce(
    (sum, s) => sum + (s.analytics?.hintCount ?? 0),
    0
  )

  // 活跃度条形图最大值
  const maxDaily = Math.max(...dailyActivity, 1)

  return (
    <div className="relative flex flex-col h-full bg-[#FFFBF5]">
      {/* 装饰背景 */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-teal-200/[0.07] blur-3xl" />
        <div className="absolute top-1/2 -left-12 w-44 h-44 rounded-full bg-amber-200/[0.06] blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center px-4 py-3 shrink-0 md:px-8">
        <button
          onClick={() => navigate('/')}
          aria-label="返回首页"
          className="text-gray-500 hover:text-teal-600 mr-3 text-xl transition-colors p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          ←
        </button>
        <h1 className="text-lg font-semibold text-gray-700">本周学习报告</h1>
      </header>

      {/* 内容 */}
      <main
        ref={mainRef}
        tabIndex={-1}
        className="relative z-10 flex-1 overflow-y-auto px-4 py-4 md:px-8 outline-none"
        aria-label="本周学习报告"
      >
        {/* 骨架屏加载态 */}
        {loading ? (
          <div className="max-w-lg mx-auto" role="status" aria-label="加载中">
            <SkeletonStats />
            <span className="sr-only">正在加载周报数据...</span>
          </div>
        ) : (
          <div className="max-w-lg mx-auto space-y-4">
            {/* 空状态（无本周数据时优先展示） */}
            {weekSessions.length === 0 ? (
              <div className="text-center py-12 animate-fade-up">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-teal-50 to-emerald-50 mb-4">
                  <span className="text-4xl" aria-hidden="true">📭</span>
                </div>
                <p className="text-gray-600 text-sm font-medium">本周还没有学习记录</p>
                <p className="text-gray-500 text-xs mt-1">开始一道题就有数据了，加油！</p>
                <button
                  onClick={() => navigate('/')}
                  className="mt-4 px-6 py-2.5 bg-teal-500 text-white rounded-2xl text-sm font-semibold hover:bg-teal-600 active:scale-[0.98] transition-all shadow-md"
                >
                  去学习
                </button>
              </div>
            ) : (
              <>
                {/* Streak 卡 */}
                <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-amber-100/80 p-4 animate-fade-up" aria-label="连续学习天数">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl" aria-hidden="true">{streak.currentStreak > 0 ? '🔥' : '📚'}</span>
                    <div>
                      <p className="text-2xl font-bold text-gray-800">{streak.currentStreak} 天</p>
                      <p className="text-xs text-gray-500">
                        连续学习{streak.longestStreak > streak.currentStreak
                          ? ` · 历史最长 ${streak.longestStreak} 天`
                          : ''}
                      </p>
                    </div>
                  </div>
                </section>

                {/* 概览统计 */}
                <section className="grid grid-cols-3 gap-2 animate-fade-up" style={{ animationDelay: '60ms' }} aria-label="本周概览">
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100/80 p-3 text-center">
                    <p className="text-2xl font-bold text-teal-600">{weekSessions.length}</p>
                    <p className="text-xs text-gray-500">本周题目</p>
                  </div>
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100/80 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-600">{resolveRate}%</p>
                    <p className="text-xs text-gray-500">解决率</p>
                  </div>
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100/80 p-3 text-center">
                    <p className="text-2xl font-bold text-purple-600">{independentRate}%</p>
                    <p className="text-xs text-gray-500">独立解决</p>
                  </div>
                </section>

                {/* 每日活跃度 */}
                <section
                  className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100/80 p-4 animate-fade-up"
                  style={{ animationDelay: '120ms' }}
                  aria-label="每日活跃度"
                >
                  <p className="text-sm font-medium text-gray-600 mb-3">每日活跃度</p>
                  <div className="flex items-end gap-1.5 h-20" role="img" aria-label={`本周每日活跃度：${dailyActivity.map((c, i) => `周${DAY_NAMES[i]}${c}题`).join('，')}`}>
                    {dailyActivity.map((count, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className={`w-full rounded-t-lg transition-all ${
                            count > 0 ? 'bg-teal-400' : 'bg-gray-100'
                          }`}
                          style={{ height: `${Math.max(4, (count / maxDaily) * 56)}px` }}
                        />
                        <span className="text-[10px] text-gray-500">{DAY_NAMES[i]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-gray-400">{dayLabels[0]}</span>
                    <span className="text-[10px] text-gray-400">{dayLabels[6]}</span>
                  </div>
                </section>

                {/* 策略使用 */}
                {strategyStats.length > 0 && (
                  <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100/80 p-4 animate-fade-up" style={{ animationDelay: '180ms' }} aria-label="常用策略">
                    <p className="text-sm font-medium text-gray-600 mb-3">常用策略</p>
                    <div className="space-y-2">
                      {strategyStats.slice(0, 5).map(([name, count]) => (
                        <div key={name} className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 w-16 shrink-0">{name}</span>
                          <div className="flex-1 bg-gray-50 rounded-full h-2.5" role="progressbar" aria-valuenow={count} aria-valuemax={strategyStats[0]?.[1] ?? 1} aria-label={`${name}：${count}次`}>
                            <div
                              className="bg-blue-400 h-2.5 rounded-full transition-all"
                              style={{
                                width: `${Math.max(8, (count / (strategyStats[0]?.[1] ?? 1)) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-6 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* 情绪分布 */}
                {emotionStats.length > 0 && (
                  <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100/80 p-4 animate-fade-up" style={{ animationDelay: '240ms' }} aria-label="情绪分布">
                    <p className="text-sm font-medium text-gray-600 mb-3">情绪分布</p>
                    <div className="flex flex-wrap gap-2">
                      {emotionStats.map(([emotion, count]) => (
                        <div
                          key={emotion}
                          className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3 py-1.5"
                        >
                          <span className="text-sm" aria-hidden="true">{EMOTION_EMOJI[emotion]}</span>
                          <span className="text-xs text-gray-600">{emotion}</span>
                          <span className="text-xs text-gray-500">{count}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* 提示统计 */}
                <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100/80 p-4 animate-fade-up" style={{ animationDelay: '300ms' }} aria-label="提示统计">
                  <p className="text-sm font-medium text-gray-600 mb-2">本周提示</p>
                  <p className="text-xs text-gray-500">
                    共收到 <span className="font-semibold text-gray-600">{totalHints}</span> 次 AI 提示
                    {weekSessions.length > 0 && (
                      <>, 平均每题 <span className="font-semibold text-gray-600">
                        {Math.round(totalHints / weekSessions.length)}
                      </span> 次</>
                    )}
                  </p>
                </section>
              </>
            )}

            {/* 底部留白 */}
            <div className="h-6" />
          </div>
        )}
      </main>
    </div>
  )
}
