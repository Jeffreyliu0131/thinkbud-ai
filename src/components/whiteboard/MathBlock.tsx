import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface MathBlockProps {
  /** KaTeX/LaTeX expression string */
  tex: string
  /** Use display mode (centered, larger) vs inline */
  displayMode?: boolean
  /** Additional CSS class for the container */
  className?: string
}

/**
 * Thin wrapper around katex.renderToString().
 * Renders math expressions as HTML. Handles errors gracefully
 * by showing the raw tex string in red on parse failure.
 */
export function MathBlock({ tex, displayMode = true, className }: MathBlockProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        throwOnError: false,
        displayMode,
        // errorColor is shown for unrecognized commands (not a crash)
        errorColor: '#ef4444',
      })
    } catch {
      // Catastrophic failure (should not happen with throwOnError: false)
      // Escape tex to prevent XSS from LLM-sourced input
      const escaped = tex
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
      return `<span style="color:#ef4444">${escaped}</span>`
    }
  }, [tex, displayMode])

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
