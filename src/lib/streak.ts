import type { Session } from '../types'

export interface StreakInfo {
  currentStreak: number   // 连续天数
  longestStreak: number   // 历史最长
  todayDone: boolean      // 今天是否学习过
  totalDays: number       // 总学习天数
}

/** 将时间戳转为 YYYY-MM-DD 本地日期字符串 */
function toDateKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 从会话列表计算 streak 信息 */
export function computeStreak(sessions: Session[]): StreakInfo {
  if (sessions.length === 0) {
    return { currentStreak: 0, longestStreak: 0, todayDone: false, totalDays: 0 }
  }

  // 收集所有有活动的日期（去重）
  const daySet = new Set<string>()
  for (const s of sessions) {
    daySet.add(toDateKey(s.createdAt))
  }

  const today = toDateKey(Date.now())
  const todayDone = daySet.has(today)
  const totalDays = daySet.size

  // 按日期排序（降序）
  const sortedDays = Array.from(daySet).sort().reverse()

  // 计算当前连续天数（从今天或昨天开始往回数）
  let currentStreak = 0
  const now = new Date()
  const checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // 如果今天没学习，从昨天开始检查
  if (!todayDone) {
    checkDate.setDate(checkDate.getDate() - 1)
  }

  for (let i = 0; i < 365; i++) {
    const key = toDateKey(checkDate.getTime())
    if (daySet.has(key)) {
      currentStreak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      break
    }
  }

  // 计算历史最长连续天数
  let longestStreak = 0
  let tempStreak = 1
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1])
    const curr = new Date(sortedDays[i])
    const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)
    if (Math.round(diffDays) === 1) {
      tempStreak++
    } else {
      longestStreak = Math.max(longestStreak, tempStreak)
      tempStreak = 1
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak, currentStreak)

  return { currentStreak, longestStreak, todayDone, totalDays }
}

/** 根据 streak 返回鼓励语 */
export function getStreakMessage(info: StreakInfo): string | null {
  if (info.currentStreak === 0 && info.totalDays === 0) return null
  if (info.currentStreak === 0) return '今天还没学习哦，开始一道题吧！'
  if (info.currentStreak === 1 && info.todayDone) return '今天已经学习了，棒！'
  if (info.currentStreak <= 3) return `连续 ${info.currentStreak} 天学习，继续加油！`
  if (info.currentStreak <= 7) return `连续 ${info.currentStreak} 天！好习惯正在养成！`
  return `连续 ${info.currentStreak} 天！你太厉害了！`
}
