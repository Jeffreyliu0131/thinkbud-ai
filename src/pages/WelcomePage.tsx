import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, FileText, BarChart3, Sprout } from 'lucide-react'
import { type GradeLevel } from '../types'
import BudMascot from '../components/BudMascot'
import Onboarding from '../components/Onboarding'
import { useAuth } from '../contexts/AuthContext'
import { getAllSessions } from '../lib/db'
import { computeStreak, getStreakMessage, type StreakInfo } from '../lib/streak'
import { fetchWithTimeout } from '../lib/api'

/** 根据当前小时返回时段问候 */
function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了！'
  if (h < 12) return '早上好！'
  if (h < 18) return '下午好！'
  return '晚上好！'
}

/** 低年级 SVG 插画：积木 + 蜡笔 */
function BlocksIllustration() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="w-14 h-14 md:w-16 md:h-16">
      {/* 蓝色方块 */}
      <rect x="8" y="28" width="20" height="20" rx="3" fill="#93C5FD" />
      {/* 橙色方块 */}
      <rect x="22" y="16" width="18" height="18" rx="3" fill="#FDBA74" />
      {/* 绿色三角 */}
      <polygon points="44,34 56,34 50,20" fill="#6EE7B7" />
      {/* 红色蜡笔 */}
      <rect x="46" y="38" width="6" height="18" rx="2" fill="#FCA5A5" />
      <polygon points="46,38 52,38 49,32" fill="#F87171" />
    </svg>
  )
}

/** 高年级 SVG 插画：打开的书 + 灯泡 */
function BookIllustration() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="w-14 h-14 md:w-16 md:h-16">
      {/* 打开的书 - 左页 */}
      <path d="M8 44 L8 20 Q20 16, 30 20 L30 44 Q20 40, 8 44Z" fill="#BFDBFE" stroke="#93C5FD" strokeWidth="1" />
      {/* 打开的书 - 右页 */}
      <path d="M30 44 L30 20 Q40 16, 52 20 L52 44 Q40 40, 30 44Z" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="1" />
      {/* 书上的线条 */}
      <line x1="13" y1="26" x2="26" y2="24" stroke="#93C5FD" strokeWidth="1" strokeLinecap="round" />
      <line x1="13" y1="32" x2="26" y2="30" stroke="#93C5FD" strokeWidth="1" strokeLinecap="round" />
      <line x1="34" y1="24" x2="47" y2="26" stroke="#93C5FD" strokeWidth="1" strokeLinecap="round" />
      <line x1="34" y1="30" x2="47" y2="32" stroke="#93C5FD" strokeWidth="1" strokeLinecap="round" />
      {/* 灯泡 */}
      <circle cx="50" cy="14" r="8" fill="#FDE68A" />
      <rect x="48" y="22" width="4" height="3" rx="1" fill="#FBBF24" />
      {/* 灯泡光芒 */}
      <line x1="50" y1="2" x2="50" y2="4" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="58" y1="8" x2="56" y2="10" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="42" y1="8" x2="44" y2="10" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="40" y1="16" x2="42" y2="15" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="60" y1="16" x2="58" y2="15" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const GRADE_CONFIG: { key: GradeLevel; label: string; sub: string; bg: string; border: string; borderActive: string; Illustration: React.FC }[] = [
  {
    key: 'lower',
    label: '1-3年级',
    sub: '刚开始探索',
    bg: 'bg-gradient-to-br from-orange-50 to-rose-50',
    border: 'border-orange-100',
    borderActive: 'ring-teal-400',
    Illustration: BlocksIllustration,
  },
  {
    key: 'upper',
    label: '4-6年级',
    sub: '已经会不少',
    bg: 'bg-gradient-to-br from-sky-50 to-indigo-50',
    border: 'border-sky-100',
    borderActive: 'ring-teal-400',
    Illustration: BookIllustration,
  },
]

export default function WelcomePage() {
  const { user, completeOnboarding } = useAuth()
  const [showOnboarding, setShowOnboarding] = useState(
    () => !!(user && !user.onboardingCompleted)
  )
  const [grade, setGrade] = useState<GradeLevel | null>(() => {
    const saved = localStorage.getItem('thinkbud_grade')
    return saved === 'lower' || saved === 'upper' ? saved : null
  })
  const [streak, setStreak] = useState<StreakInfo | null>(null)
  const navigate = useNavigate()
  const greeting = useMemo(() => getGreeting(), [])

  useEffect(() => {
    getAllSessions().then((sessions) => {
      setStreak(computeStreak(sessions))
    })
  }, [])

  const streakMsg = streak ? getStreakMessage(streak) : null

  const handleStart = async () => {
    if (!grade) return
    // 一次性请求摄像头+麦克风权限，进入 ChatPage 后不再弹窗
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      stream.getTracks().forEach(t => t.stop())
    } catch {
      // 权限被拒绝也继续导航，ChatPage 各模块有各自的错误处理
    }
    navigate('/chat', { state: { gradeLevel: grade } })
  }

  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    completeOnboarding()
    // 通知服务端标记完成
    fetchWithTimeout('/api/auth/onboarding', {
      method: 'POST',
      timeout: 5000,
    }).catch(() => {})
  }

  return (
    <>
    {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
    <main className="relative flex flex-col items-center justify-center h-full px-6 overflow-hidden page-enter-fade-up bg-[var(--color-bg-primary)]" style={{ paddingTop: 'max(2rem, var(--safe-top))', paddingBottom: 'max(2rem, var(--safe-bottom))' }}>
      {/* 装饰浮动圆圈 */}
      <div className="absolute top-12 left-8 w-32 h-32 rounded-full bg-teal-200/[0.07] blur-2xl" aria-hidden="true" />
      <div className="absolute bottom-20 right-6 w-40 h-40 rounded-full bg-amber-200/[0.08] blur-2xl" aria-hidden="true" />
      <div className="absolute top-1/3 right-12 w-20 h-20 rounded-full bg-rose-200/[0.06] blur-xl" aria-hidden="true" />

      {/* 内容容器 */}
      <div className="relative z-10 w-full max-w-sm md:max-w-md lg:max-w-lg flex flex-col items-center">
        {/* 吉祥物 */}
        <div
          className="w-28 md:w-36 mb-2 animate-fade-up"
          style={{ animationDelay: '0ms' }}
          aria-hidden="true"
        >
          <BudMascot
            animate={grade ? 'wave' : 'idle'}
            speechBubble={grade ? '准备好了就点开始！' : '今天想挑战什么题目？'}
          />
        </div>

        {/* 时段问候 */}
        <p
          className="text-teal-600 font-bold text-sm md:text-base mb-1 animate-fade-up"
          style={{ animationDelay: '100ms' }}
        >
          {greeting}
        </p>

        {/* 标题 */}
        <h1
          className="text-3xl md:text-4xl font-bold text-[var(--color-text-primary)] mb-2 animate-fade-up"
          style={{ animationDelay: '200ms' }}
        >
          思考教练
        </h1>

        {/* 副标题 */}
        <p
          className="text-[var(--color-text-secondary)] mb-4 text-center text-sm md:text-base animate-fade-up"
          style={{ animationDelay: '300ms' }}
        >
          对着作业说一说，我来引导你自己想通它
        </p>

        {/* Streak 横幅 */}
        {streak && streak.totalDays > 0 && (
          <section
            className="w-full flex items-center justify-between bg-[var(--color-bg-card)] rounded-[var(--radius-card)] px-4 py-3 border border-amber-100/80 mb-6 animate-fade-up"
            style={{ animationDelay: '350ms' }}
            aria-label="学习连续天数"
          >
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">{streak.currentStreak > 0 ? '🔥' : '💤'}</span>
              <div>
                <p className="text-sm font-bold text-[var(--color-text-primary)]">
                  {streak.currentStreak > 0
                    ? `${streak.currentStreak} 天连续学习`
                    : '暂无连续学习'}
                </p>
                {streakMsg && (
                  <p className="text-xs text-[var(--color-text-secondary)]">{streakMsg}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate('/weekly')}
              aria-label="查看本周学习报告"
              className="text-xs text-teal-500 hover:text-teal-600 font-bold shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              周报 →
            </button>
          </section>
        )}

        {/* 学段卡片 */}
        <div
          className="grid grid-cols-2 gap-3 w-full mb-6 animate-fade-up"
          style={{ animationDelay: '400ms' }}
          role="radiogroup"
          aria-label="选择学段"
        >
          {GRADE_CONFIG.map(({ key, label, sub, bg, border, borderActive, Illustration }) => (
            <button
              key={key}
              onClick={() => { setGrade(key); localStorage.setItem('thinkbud_grade', key) }}
              role="radio"
              aria-checked={grade === key}
              aria-label={`${label}，${sub}`}
              className={`relative flex flex-col items-center pt-5 pb-4 px-3 rounded-[var(--radius-card)] border transition-all duration-200 active:scale-[0.97] min-h-[var(--touch-min)] ${bg} ${
                grade === key
                  ? `ring-2 ${borderActive} shadow-lg scale-[1.02] border-transparent`
                  : `${border} hover:shadow-md`
              }`}
            >
              {/* 选中 check */}
              {grade === key && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center" aria-hidden="true">
                  <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              <div aria-hidden="true"><Illustration /></div>
              <p className="text-base md:text-lg font-bold text-[var(--color-text-primary)] mt-2">{label}</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{sub}</p>
            </button>
          ))}
        </div>

        {/* 选择提示 */}
        {!grade && (
          <p className="text-sm text-[var(--color-text-secondary)] text-center mb-4 animate-fade-up" style={{ animationDelay: '450ms' }}>
            选择你的年级，然后点开始
          </p>
        )}

        {/* 开始学习按钮 */}
        <button
          onClick={handleStart}
          disabled={!grade}
          aria-label={grade ? `开始${grade === 'lower' ? '1-3年级' : '4-6年级'}学习` : '请先选择学段'}
          className={`w-full py-4 text-lg font-bold transition-all animate-fade-up ${
            grade
              ? 'bg-teal-500 text-white btn-3d btn-3d-teal btn-glow'
              : 'bg-gray-100 text-[var(--color-text-muted)] cursor-not-allowed rounded-[var(--radius-pill)]'
          }`}
          style={{ animationDelay: '500ms' }}
        >
          <Mic size={20} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />开始学习
        </button>

        {/* 历史入口 */}
        <button
          onClick={() => navigate('/history')}
          aria-label="查看历史学习记录"
          className="mt-4 text-sm text-[var(--color-text-secondary)] hover:text-teal-500 transition-colors animate-fade-up min-h-[var(--touch-min)] flex items-center rounded-[var(--radius-pill)]"
          style={{ animationDelay: '600ms' }}
        >
          <FileText size={16} className="inline mr-1 -mt-0.5" aria-hidden="true" />查看历史记录
        </button>

        {/* 我的花园入口 */}
        <button
          onClick={() => navigate('/progress')}
          aria-label="查看我的思维花园"
          className="mt-2 text-sm text-[var(--color-text-secondary)] hover:text-teal-500 transition-colors animate-fade-up min-h-[var(--touch-min)] flex items-center rounded-[var(--radius-pill)]"
          style={{ animationDelay: '650ms' }}
        >
          <Sprout size={16} className="inline mr-1 -mt-0.5" aria-hidden="true" />我的花园
        </button>

        {/* 家长报告入口 */}
        <button
          onClick={() => navigate('/parent')}
          aria-label="查看家长报告"
          className="mt-2 text-sm text-[var(--color-text-secondary)] hover:text-teal-500 transition-colors animate-fade-up min-h-[var(--touch-min)] flex items-center rounded-[var(--radius-pill)]"
          style={{ animationDelay: '750ms' }}
        >
          <BarChart3 size={16} className="inline mr-1 -mt-0.5" aria-hidden="true" />家长报告
        </button>
      </div>
    </main>
    </>
  )
}
