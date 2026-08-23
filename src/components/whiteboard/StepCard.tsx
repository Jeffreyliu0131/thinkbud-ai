import { MathBlock } from './MathBlock'
import type { WhiteboardStep } from '../../types/whiteboard'

interface StepCardProps {
  step: WhiteboardStep
}

export function StepCard({ step }: StepCardProps) {
  const isDone = step.status === 'done'
  const isCurrent = step.status === 'current'

  return (
    <div
      className={`
        flex-shrink-0 w-28 sm:w-32 rounded-xl p-3 snap-center
        transition-all duration-300
        ${isCurrent
          ? 'bg-white shadow-lg ring-2 ring-[var(--color-accent-warm)] scale-105'
          : isDone
            ? 'bg-white/60 shadow-sm'
            : 'bg-white/40 shadow-sm opacity-60'
        }
      `}
    >
      {/* Step number + status */}
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-bold ${isCurrent ? 'text-[var(--color-accent-warm)]' : 'text-gray-400'}`}>
          {step.id}
        </span>
        {isDone && (
          <span className="text-xs text-[var(--color-accent-success)]">✓</span>
        )}
        {isCurrent && (
          <span className="w-2 h-2 rounded-full bg-[var(--color-accent-warm)] animate-pulse" />
        )}
      </div>

      {/* Label */}
      <p className={`text-sm font-medium leading-tight mb-1.5 ${isDone ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
        {step.label}
      </p>

      {/* Math expression (optional) */}
      {step.math && (
        <div className={`text-center mb-1.5 ${isDone ? 'opacity-50' : ''}`}>
          <MathBlock tex={step.math} displayMode={false} className="text-sm" />
        </div>
      )}

      {/* Hint (optional, only for current step) */}
      {step.hint && isCurrent && (
        <p className="text-xs text-[var(--color-accent-warm)] leading-tight mt-1">
          {step.hint}
        </p>
      )}
    </div>
  )
}
