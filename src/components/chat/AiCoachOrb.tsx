import type { InteractionPhase, EmotionType } from '../../types'
import CoachFace from './CoachFace'

interface AiCoachOrbProps {
  phase: InteractionPhase
  emotion?: EmotionType
  statusText?: string
}

/**
 * AI 教练 Orb — 核心视觉组件（暖色系）
 * 根据 phase 变色变动效
 * audioLevel 通过 CSS 变量 --audio-level 驱动实时缩放，零 React 重渲染
 * 配色与 WelcomePage 的 teal/amber 体系一致
 */

// Phase 对应的颜色方案（暖色系，适配亮色背景）
const PHASE_COLORS: Record<InteractionPhase, {
  core: string
  glow: string
  ring: string
  ripple: string
}> = {
  idle: {
    core: 'from-teal-400 to-emerald-500',
    glow: 'bg-teal-400/15',
    ring: 'border-teal-300/25',
    ripple: 'border-teal-300/20',
  },
  connecting: {
    core: 'from-teal-300 to-cyan-500',
    glow: 'bg-cyan-400/15',
    ring: 'border-cyan-300/25',
    ripple: 'border-cyan-300/20',
  },
  listening: {
    core: 'from-amber-400 to-orange-500',
    glow: 'bg-amber-400/20',
    ring: 'border-amber-300/35',
    ripple: 'border-amber-300/25',
  },
  processing: {
    core: 'from-teal-300 to-cyan-500',
    glow: 'bg-cyan-400/15',
    ring: 'border-cyan-300/25',
    ripple: 'border-cyan-300/20',
  },
  speaking: {
    core: 'from-emerald-400 to-teal-500',
    glow: 'bg-emerald-400/15',
    ring: 'border-emerald-300/25',
    ripple: 'border-emerald-300/20',
  },
}

// Phase 对应的 CSS 动画 class
const PHASE_ANIMATION: Record<InteractionPhase, string> = {
  idle: 'orb-breathe',
  connecting: 'orb-rotate',  // 连接中用旋转动效
  listening: '',       // audioLevel 驱动，不用 CSS 动画
  processing: 'orb-rotate',
  speaking: '',        // audioLevel 驱动
}

// 是否需要 audioLevel 驱动缩放
const AUDIO_DRIVEN_PHASES = new Set<InteractionPhase>(['listening', 'speaking'])

export default function AiCoachOrb({
  phase,
  emotion,
  statusText,
}: AiCoachOrbProps) {
  const colors = PHASE_COLORS[phase]
  const animClass = PHASE_ANIMATION[phase]
  const useAudioScale = AUDIO_DRIVEN_PHASES.has(phase)

  // 状态文字
  const text = statusText ?? {
    idle: '点击🎤开始',
    connecting: '连接中…',
    listening: '正在听你说…',
    processing: '思考中…',
    speaking: '正在回答…',
  }[phase]

  return (
    <div className="flex flex-col items-center justify-center gap-4 md:gap-6">
      {/* Orb 容器 — 手机 160px, 平板 200px, 桌面 240px */}
      <div className="relative w-40 h-40 md:w-50 md:h-50 lg:w-60 lg:h-60">
        {/* Glow 光晕 — 柔和暖色 */}
        <div
          className={`absolute -inset-8 rounded-full blur-3xl transition-colors duration-500 ${colors.glow} ${
            useAudioScale ? 'orb-audio-scale-glow' : phase === 'idle' ? 'orb-glow-breathe' : ''
          }`}
        />

        {/* 最外圈 Ring 3 */}
        <div
          className={`absolute -inset-4 rounded-full border transition-colors duration-500 ${colors.ring} ${
            phase === 'listening' ? 'orb-ripple' : ''
          }`}
        />

        {/* 中圈 Ring 2 */}
        <div
          className={`absolute -inset-2 rounded-full border transition-colors duration-500 ${colors.ring} ${
            phase === 'listening' ? 'orb-ripple' : ''
          }`}
          style={phase === 'listening' ? { animationDelay: '0.3s' } : undefined}
        />

        {/* 内圈 Ring 1 */}
        <div
          className={`absolute -inset-0.5 rounded-full border transition-colors duration-500 ${colors.ring}`}
        />

        {/* Core 实心球 — 渐变 + 内阴影 */}
        <div
          className={`absolute inset-0 rounded-full bg-gradient-to-br ${colors.core} shadow-xl transition-all duration-500 ${animClass} ${
            useAudioScale ? 'orb-audio-scale' : ''
          }`}
          style={{
            boxShadow: '0 10px 40px -10px rgba(20, 184, 166, 0.3), inset 0 -4px 12px rgba(0,0,0,0.1)',
          }}
        >
          {/* CoachFace */}
          <div className="absolute inset-4">
            <CoachFace phase={phase} emotion={emotion} />
          </div>
        </div>

        {/* Listening 波纹 — 暖色 */}
        {phase === 'listening' && (
          <>
            <div className={`absolute -inset-6 rounded-full border ${colors.ripple} orb-ripple`} />
            <div
              className={`absolute -inset-10 rounded-full border ${colors.ripple} orb-ripple`}
              style={{ animationDelay: '0.6s' }}
            />
          </>
        )}

        {/* Processing 旋转弧线 — teal 色 */}
        {phase === 'processing' && (
          <div className="absolute -inset-3 rounded-full border-2 border-transparent border-t-teal-400/60 border-r-cyan-400/30 orb-rotate" />
        )}

        {/* Speaking 光晕脉冲 — 温暖绿色 */}
        {phase === 'speaking' && (
          <div className="absolute -inset-5 rounded-full bg-emerald-300/12 blur-xl orb-audio-scale-speak" />
        )}
      </div>

      {/* 状态文字 — 暖色系 */}
      <p className="text-[var(--color-text-secondary)] text-sm md:text-base tracking-wide" aria-live="polite" role="status">{text}</p>
    </div>
  )
}
