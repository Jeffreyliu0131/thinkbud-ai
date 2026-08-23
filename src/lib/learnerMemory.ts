import type { Session, LearnerProfile } from '../types'
import { getLearnerProfile, saveLearnerProfile, getAllSessions } from './db'

/** 从所有会话重建 learner profile */
export async function rebuildLearnerProfile(): Promise<LearnerProfile> {
  const sessions = await getAllSessions()

  const frequentErrors: Record<string, number> = {}
  const strategyCount: Record<string, number> = {}
  let totalResolved = 0

  for (const s of sessions) {
    if (s.resolved) totalResolved++

    // 提取策略使用
    for (const st of s.analytics?.strategiesUsed ?? []) {
      strategyCount[st] = (strategyCount[st] ?? 0) + 1
    }

    // 提取错误模式（从情绪弧线中推断挣扎区域）
    if (s.analytics) {
      const { emotionArc, hintCount, resolutionType } = s.analytics

      // 高提示 + 引导解决 = 有困难
      if (resolutionType === 'guided' && hintCount >= 5) {
        // 用策略名标记薄弱点
        for (const st of s.analytics.strategiesUsed) {
          const key = `${st}相关计算`
          frequentErrors[key] = (frequentErrors[key] ?? 0) + 1
        }
      }

      // 有挫败情绪 = 标记
      if (emotionArc.includes('沮丧')) {
        const key = '容易受挫'
        frequentErrors[key] = (frequentErrors[key] ?? 0) + 1
      }

      // 未解决
      if (resolutionType === 'unresolved') {
        for (const st of s.analytics.strategiesUsed) {
          const key = `${st}未掌握`
          frequentErrors[key] = (frequentErrors[key] ?? 0) + 1
        }
      }
    }
  }

  // 按使用频率排序策略
  const preferredStrategies = Object.entries(strategyCount)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)

  const profile: LearnerProfile = {
    id: 'default',
    frequentErrors,
    preferredStrategies,
    totalSessions: sessions.length,
    totalResolved,
    updatedAt: Date.now(),
  }

  await saveLearnerProfile(profile)
  return profile
}

/** 增量更新 profile（会话完成时调用） */
export async function updateProfileFromSession(session: Session): Promise<void> {
  const profile = await getLearnerProfile()
  if (!profile) {
    // 首次，全量重建
    await rebuildLearnerProfile()
    return
  }

  profile.totalSessions++
  if (session.resolved) profile.totalResolved++

  if (session.analytics) {
    for (const st of session.analytics.strategiesUsed) {
      // 更新偏好策略
      if (!profile.preferredStrategies.includes(st)) {
        profile.preferredStrategies.push(st)
      }

      if (session.analytics.resolutionType === 'guided' && session.analytics.hintCount >= 5) {
        const key = `${st}相关计算`
        profile.frequentErrors[key] = (profile.frequentErrors[key] ?? 0) + 1
      }
    }

    if (session.analytics.emotionArc.includes('沮丧')) {
      profile.frequentErrors['容易受挫'] = (profile.frequentErrors['容易受挫'] ?? 0) + 1
    }

    if (session.analytics.resolutionType === 'unresolved') {
      for (const st of session.analytics.strategiesUsed) {
        const key = `${st}未掌握`
        profile.frequentErrors[key] = (profile.frequentErrors[key] ?? 0) + 1
      }
    }
  }

  profile.updatedAt = Date.now()
  await saveLearnerProfile(profile)
}

/** 生成注入 system prompt 的记忆片段 */
export function buildMemorySnippet(profile: LearnerProfile): string {
  const lines: string[] = []

  lines.push(`## 📝 学生画像（来自 ${profile.totalSessions} 次历史会话）`)

  if (profile.preferredStrategies.length > 0) {
    lines.push(`- 偏好策略：${profile.preferredStrategies.slice(0, 4).join('、')}`)
  }

  const resolveRate = profile.totalSessions > 0
    ? Math.round((profile.totalResolved / profile.totalSessions) * 100)
    : 0
  lines.push(`- 解题成功率：${resolveRate}%`)

  // 取 top 3 常见问题
  const topErrors = Object.entries(profile.frequentErrors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  if (topErrors.length > 0) {
    lines.push(`- 薄弱点：${topErrors.map(([k, v]) => `${k}(${v}次)`).join('、')}`)
    lines.push(`- 请特别关注这些薄弱点，用更小的步骤引导`)
  }

  if (profile.frequentErrors['容易受挫'] >= 3) {
    lines.push(`- ⚠️ 该学生容易情绪低落，请优先安抚再引导`)
  }

  return lines.join('\n')
}
