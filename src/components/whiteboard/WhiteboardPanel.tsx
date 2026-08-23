import { useRef, useEffect } from 'react'
import { StepCard } from './StepCard'
import type { WhiteboardStep } from '../../types/whiteboard'

interface WhiteboardPanelProps {
  steps: WhiteboardStep[]
  className?: string
}

export function WhiteboardPanel({ steps, className }: WhiteboardPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to current step when steps change
  useEffect(() => {
    if (!scrollRef.current || steps.length === 0) return

    const currentIndex = steps.findIndex(s => s.status === 'current')
    if (currentIndex === -1) return

    const container = scrollRef.current
    const cards = container.children
    if (cards[currentIndex]) {
      (cards[currentIndex] as HTMLElement).scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [steps])

  if (steps.length === 0) return null

  return (
    <div className={`w-full ${className ?? ''}`}
      style={{ height: 'clamp(120px, 35vh, 200px)' }}
    >
      {/* Board header */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-1">
        <span className="text-xs font-medium text-gray-400">解题步骤</span>
        <span className="text-xs text-gray-300">
          {steps.filter(s => s.status === 'done').length}/{steps.length}
        </span>
      </div>

      {/* Scrollable step cards */}
      <div
        ref={scrollRef}
        className="flex gap-3 px-4 pb-2 overflow-x-auto h-[calc(100%-2rem)]
          snap-x snap-mandatory scroll-smooth
          scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]
          [&::-webkit-scrollbar]:hidden
          items-center"
      >
        {steps.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </div>
    </div>
  )
}
