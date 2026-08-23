import { useState, useEffect, useMemo } from 'react'
import type { ChildProgressResponse } from '../types/child'
import type { ParentReport } from '../types/parent'

// ===== Exported types =====

export type ColdStartLevel = 0 | 1 | 2 | 3 | 4

export interface UpgradeInfo {
  concept: string
  label: string
  subject: string
  from: number
  to: number
}

// ===== Constants =====

export const SUBJECT_COLORS: Record<string, string> = {
  math: 'bg-teal-500',
  chinese: 'bg-amber-500',
  english: 'bg-violet-500',
}

export const SUBJECT_LABELS: Record<string, string> = {
  math: '数学',
  chinese: '语文',
  english: '英语',
}

// ===== Cold start level (D-08) =====

function getColdStartLevel(sessionCount: number): ColdStartLevel {
  if (sessionCount === 0) return 0
  if (sessionCount === 1) return 1
  if (sessionCount <= 3) return 2
  if (sessionCount <= 8) return 3
  return 4
}

// ===== Celebration detection (D-11, D-12, D-13) =====

const STORAGE_KEY = 'thinkbud-star-cache'

function detectUpgrades(data: ChildProgressResponse): UpgradeInfo[] {
  const upgrades: UpgradeInfo[] = []

  // Read cached star values
  let cached: Record<string, number> = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) cached = JSON.parse(raw)
  } catch { /* ignore parse errors */ }

  const newCache: Record<string, number> = {}

  for (const [subject, sp] of Object.entries(data.subjects)) {
    for (const point of sp.points) {
      const key = `${subject}:${point.concept}`
      newCache[key] = point.stars
      const prev = cached[key]
      // Only flag upgrades where we had a previous value AND current is higher
      if (prev !== undefined && prev > 0 && point.stars > prev) {
        upgrades.push({
          concept: point.concept,
          label: point.label,
          subject,
          from: prev,
          to: point.stars,
        })
      }
    }
  }

  // Update cache AFTER comparison
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newCache))
  } catch { /* ignore storage errors */ }

  return upgrades
}

// ===== Main hook =====

export function useProgressData() {
  const [data, setData] = useState<ChildProgressResponse | null>(null)
  const [sessions, setSessions] = useState<ParentReport['conversations']>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [upgrades, setUpgrades] = useState<UpgradeInfo[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/child/progress').then(r => r.json()),
      fetch('/api/parent/report?range=7d').then(r => r.json()).catch(() => null),
    ])
      .then(([progressData, reportData]: [ChildProgressResponse, ParentReport | null]) => {
        setData(progressData)
        if (reportData?.conversations) {
          setSessions(reportData.conversations)
        }
        // Run celebration detection exactly once after data resolves
        setUpgrades(detectUpgrades(progressData))
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  // Derived values
  const coldStartLevel = useMemo<ColdStartLevel>(() => {
    if (!data) return 0
    return getColdStartLevel(data.sessionCount)
  }, [data])

  const totalPoints = useMemo(() => {
    if (!data) return 0
    return Object.values(data.subjects).reduce((sum, s) => sum + s.points.length, 0)
  }, [data])

  const masteredCount = useMemo(() => {
    if (!data) return 0
    return Object.values(data.subjects).reduce(
      (sum, s) => sum + s.points.filter(p => p.stars === 3).length, 0
    )
  }, [data])

  const exploringCount = useMemo(() => {
    if (!data) return 0
    return Object.values(data.subjects).reduce(
      (sum, s) => sum + s.points.filter(p => p.stars === 1).length, 0
    )
  }, [data])

  const mascotGreeting = useMemo(() => {
    if (!data) return ''
    if (data.sessionCount === 0) return '去和 AI 教练聊一道题吧！'
    if (data.sessionCount === 1) return '你开始探索了！'
    if (masteredCount > 0) return `已经掌握了${masteredCount}个知识点，太棒了！`
    if (totalPoints > 0) return `你已经探索了${totalPoints}个知识点！`
    return '继续加油，你做得很好！'
  }, [data, masteredCount, totalPoints])

  const defaultSubject = useMemo(() => {
    if (!data) return 'math'
    const firstWithPoints = Object.keys(data.subjects).find(
      key => data.subjects[key].points.length > 0
    )
    return firstWithPoints ?? 'math'
  }, [data])

  return {
    data,
    sessions,
    loading,
    error,
    isEmpty: !loading && (!data || data.sessionCount === 0),
    coldStartLevel,
    totalPoints,
    masteredCount,
    exploringCount,
    mascotGreeting,
    defaultSubject,
    upgrades,
  }
}
