import { Mic, Square, SkipForward } from 'lucide-react'
import type { InteractionPhase, StudentMood } from '../../types'

/** 情绪按钮配置 */
const MOOD_OPTIONS: Array<{ emoji: string; mood: StudentMood; label: string }> = [
  { emoji: '😊', mood: 'happy', label: '开心' },
  { emoji: '😕', mood: 'confused', label: '有点迷糊' },
  { emoji: '😢', mood: 'frustrated', label: '有点烦' },
]

/** 麦克风按钮的 aria-label 映射 */
const MIC_ARIA: Record<InteractionPhase, string> = {
  idle: '开始语音对话',
  connecting: '正在连接，请稍候',
  listening: '停止录音',
  processing: '正在处理，请稍候',
  speaking: '跳过语音播放',
}

interface ControlBarProps {
  phase: InteractionPhase
  hasOcr: boolean
  showGotIt: boolean
  sttTranscript: string
  sttError: string
  ttsError: string
  hasMessages: boolean
  rtcSubtitle?: string
  onTalkPress: () => void
  onSwitchProblem: () => void
  onGotIt: () => void
  onMoodSelect: (mood: StudentMood) => void
  onRetrySTT: () => void
}

/**
 * 底部控制栏 — 换题 / 情绪 / 🎤 / 搞懂了 + 状态提示
 */
export default function ControlBar({
  phase,
  hasOcr,
  showGotIt,
  sttTranscript,
  sttError,
  ttsError,
  hasMessages,
  rtcSubtitle,
  onTalkPress,
  onSwitchProblem,
  onGotIt,
  onMoodSelect,
  onRetrySTT,
}: ControlBarProps) {
  return (
    <div className="shrink-0 pt-4 px-6 md:pt-5" style={{ paddingBottom: 'max(2rem, calc(var(--safe-bottom) + 0.5rem))' }}>
      {/* 实时文字 — RTC 字幕 或 STT 转录 */}
      {(rtcSubtitle || (phase === 'listening' && sttTranscript)) && (
        <p
          className="bg-[var(--color-bg-card)] backdrop-blur-sm text-[var(--color-text-primary)] px-4 py-1.5 rounded-[var(--radius-pill)] text-sm max-w-xs mx-auto text-center mb-3 shadow-sm border border-teal-100"
          aria-live="polite"
          role="status"
        >
          {rtcSubtitle || sttTranscript}
        </p>
      )}

      {/* TTS 错误提示 */}
      {ttsError && (
        <p className="text-amber-600 text-xs text-center mb-3" role="alert">{ttsError}</p>
      )}

      {/* STT 错误提示 + 重试 */}
      {phase === 'idle' && sttError && (
        <div className="flex items-center justify-center gap-2 mb-3" role="alert">
          <p className="text-amber-600 text-xs">{sttError}</p>
          <button
            onClick={onRetrySTT}
            aria-label="重新开始语音输入"
            className="min-h-12 min-w-12 flex items-center justify-center text-xs text-teal-600 bg-teal-50 px-2.5 rounded-full border border-teal-200 active:scale-95 transition-all"
          >
            再说一次
          </button>
        </div>
      )}

      {/* 情绪反馈 — idle 态 + 已有对话时显示 */}
      {phase === 'idle' && hasMessages && !sttError && (
        <div className="flex justify-center gap-4 mb-3" role="group" aria-label="情绪反馈">
          {MOOD_OPTIONS.map(({ emoji, mood, label }) => (
            <button
              key={mood}
              onClick={() => onMoodSelect(mood)}
              aria-label={`表达情绪：${label}`}
              className="min-h-12 min-w-12 flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-transform"
            >
              <span className="text-2xl" aria-hidden="true">{emoji}</span>
              <span className="text-xs text-[var(--color-text-secondary)]">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 按钮区 */}
      <div className="flex items-center justify-center gap-4 md:gap-6">
        {/* 换题按钮 */}
        {hasOcr && phase === 'idle' && (
          <button
            onClick={onSwitchProblem}
            aria-label="换一道题"
            className="min-h-[var(--touch-min)] bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] px-4 py-2 md:px-5 md:py-2.5 rounded-[var(--radius-pill)] text-sm md:text-base active:scale-95 transition-all border border-gray-200 hover:border-teal-200 hover:text-teal-600 shadow-sm"
          >
            换题
          </button>
        )}

        {/* 🎤 大按钮 — teal 主题 */}
        <button
          onClick={onTalkPress}
          disabled={phase === 'processing'}
          aria-label={MIC_ARIA[phase]}
          className={`relative w-20 h-20 md:w-22 md:h-22 min-h-[var(--touch-min)] min-w-[var(--touch-min)] rounded-full flex items-center justify-center text-3xl md:text-4xl transition-all active:scale-95 ${
            phase === 'listening'
              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30 talk-btn-listening-warm'
              : phase === 'processing'
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : phase === 'speaking'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-teal-500 text-white border-2 border-teal-400 shadow-lg shadow-teal-500/25 btn-glow'
          }`}
        >
          {phase === 'listening' ? <Square size={28} /> : phase === 'speaking' ? <SkipForward size={28} /> : <Mic size={28} />}
        </button>

        {/* 搞懂了按钮 */}
        {showGotIt && (
          <button
            onClick={onGotIt}
            aria-label="我搞懂了，出变式题"
            className="min-h-12 bg-emerald-500 text-white px-4 py-2 md:px-5 md:py-2.5 rounded-full text-sm md:text-base font-bold active:scale-95 transition-all shadow-md shadow-emerald-500/20 hover:bg-emerald-600"
          >
            搞懂了！
          </button>
        )}
      </div>

      {/* 状态提示 — 暖灰色（processing 态不显示文字，Orb 动效已暗示） */}
      <p className="text-center text-[var(--color-text-secondary)] text-sm mt-3 state-hint-crossfade" aria-live="polite" role="status">
        {phase === 'idle' && !hasMessages && !hasOcr && '对准作业拍题，然后点麦克风'}
        {phase === 'idle' && !hasMessages && hasOcr && '点击麦克风开始对话'}
        {phase === 'listening' && '说完会自动继续'}
        {phase === 'speaking' && '点击可跳过'}
      </p>
    </div>
  )
}
