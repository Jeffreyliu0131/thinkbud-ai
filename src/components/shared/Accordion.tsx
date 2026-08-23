import { useState, useRef, useId } from 'react'
import { ChevronDown } from 'lucide-react'

interface AccordionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function Accordion({ title, defaultOpen = false, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const contentRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const triggerId = `accordion-trigger-${uid}`
  const panelId = `accordion-panel-${uid}`

  return (
    <div className="border-b border-[#E8DDD3]">
      <button
        id={triggerId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between min-h-[var(--touch-min)] px-1 py-2"
      >
        <span className="text-lg font-bold text-[var(--color-text-primary)]">{title}</span>
        <ChevronDown
          size={20}
          className={`text-[var(--color-text-muted)] transition-transform duration-300 ${
            open ? 'rotate-180' : ''
          }`}
          style={{ transitionTimingFunction: 'var(--ease-out-expo)' }}
          aria-hidden="true"
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        className="overflow-hidden transition-[max-height,opacity] duration-300"
        style={{
          maxHeight: open ? '2000px' : '0px',
          opacity: open ? 1 : 0,
          transitionTimingFunction: 'var(--ease-out-expo)',
        }}
      >
        <div ref={contentRef} className="pb-4">
          {children}
        </div>
      </div>
    </div>
  )
}
