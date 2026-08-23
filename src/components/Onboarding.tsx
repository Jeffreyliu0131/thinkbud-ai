import { useState, useEffect, useRef } from 'react'
import BudMascot from './BudMascot'

interface OnboardingProps {
  onComplete: () => void
}

const STEPS = [
  {
    icon: '📸',
    title: '拍下你的数学题',
    description: '对准题目拍一张照片，AI教练就能看到它',
  },
  {
    icon: '🎤',
    title: '和AI教练语音聊天',
    description: '对着手机说出你的想法，教练会用问题引导你',
  },
  {
    icon: '✏️',
    title: '在纸上写下你的思考',
    description: '思考发生在纸笔上，不是屏幕上——这是你的超能力',
  },
]

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const [exiting, setExiting] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  // Escape 键跳过引导
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onComplete()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onComplete])

  // Focus trap: keep Tab within the dialog
  useEffect(() => {
    if (exiting) return
    const modal = modalRef.current
    if (!modal) return

    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstEl = focusableElements[0]
    const lastEl = focusableElements[focusableElements.length - 1]

    // Auto-focus first focusable element
    firstEl?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (focusableElements.length === 0) return

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }

    modal.addEventListener('keydown', handleKeyDown)
    return () => modal.removeEventListener('keydown', handleKeyDown)
  }, [exiting, step])

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      // 最后一步：显示庆祝，然后退出
      setExiting(true)
      setTimeout(onComplete, 1200)
    }
  }

  const handleSkip = () => {
    onComplete()
  }

  if (exiting) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--color-bg-primary)]/95 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-up" role="status">
        <div className="w-32 h-36 mb-4" aria-hidden="true">
          <BudMascot animate="wave" />
        </div>
        <p className="text-xl font-bold text-[var(--color-text-primary)]">准备好了！</p>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">开始你的思考之旅吧</p>
      </div>
    )
  }

  const current = STEPS[step]

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 bg-[var(--color-bg-primary)]/95 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="新手引导"
    >
      {/* 跳过按钮 */}
      <div className="flex justify-end px-4 pt-4" style={{ paddingTop: 'max(1rem, var(--safe-top))' }}>
        <button
          onClick={handleSkip}
          aria-label="跳过引导"
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors min-w-[var(--touch-min)] min-h-[var(--touch-min)] flex items-center justify-center"
        >
          跳过 →
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center px-8" key={step}>
        <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-8 flex flex-col items-center max-w-sm w-full">
          <div className="text-6xl mb-6 animate-fade-up" aria-hidden="true">{current.icon}</div>
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-3 text-center animate-fade-up" style={{ animationDelay: '100ms' }}>
            {current.title}
          </h2>
          <p className="text-base text-[var(--color-text-secondary)] text-center max-w-xs animate-fade-up" style={{ animationDelay: '200ms' }}>
            {current.description}
          </p>
        </div>
      </div>

      {/* 底部区域 */}
      <div className="px-6 pb-6" style={{ paddingBottom: 'max(1.5rem, var(--safe-bottom))' }}>
        {/* 进度点 */}
        <div className="flex justify-center gap-2 mb-4" role="group" aria-label={`第${step + 1}步，共${STEPS.length}步`}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step ? 'bg-teal-500 w-6' : i < step ? 'bg-teal-300 w-2' : 'bg-gray-200 w-2'
              }`}
              aria-hidden="true"
            />
          ))}
        </div>

        {/* 下一步按钮 */}
        <button
          onClick={handleNext}
          className="w-full py-4 text-base font-semibold bg-teal-500 text-white btn-3d btn-3d-teal transition-all"
        >
          {step < STEPS.length - 1 ? '下一步' : '开始学习 →'}
        </button>
      </div>
    </div>
  )
}
