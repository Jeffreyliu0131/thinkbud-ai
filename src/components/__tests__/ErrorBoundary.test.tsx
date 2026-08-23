// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ErrorBoundary from '../ErrorBoundary'

// 会抛错的测试组件
function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('测试错误')
  return <div>正常内容</div>
}

// 抑制 React 和 ErrorBoundary 的 console.error
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => cleanup())

describe('ErrorBoundary', () => {
  it('正常渲染子组件', () => {
    render(
      <ErrorBoundary>
        <div>子组件内容</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('子组件内容')).toBeDefined()
  })

  it('捕获错误后显示友好界面', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('哎呀，出了点小问题')).toBeDefined()
    expect(screen.getByText('别担心，我们马上修好它！')).toBeDefined()
  })

  it('显示 😵 表情', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('😵')).toBeDefined()
  })

  it('显示重试和回首页按钮', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('重试一下')).toBeDefined()
    expect(screen.getByText('回首页')).toBeDefined()
  })

  it('点击重试恢复子组件渲染', () => {
    // 用一个可控的状态来测试
    let shouldThrow = true
    function Controlled() {
      if (shouldThrow) throw new Error('测试')
      return <div>恢复了</div>
    }

    render(
      <ErrorBoundary>
        <Controlled />
      </ErrorBoundary>
    )

    expect(screen.getByText('哎呀，出了点小问题')).toBeDefined()

    // 修复问题后点击重试
    shouldThrow = false
    fireEvent.click(screen.getByText('重试一下'))
    expect(screen.getByText('恢复了')).toBeDefined()
  })

  it('点击回首页导航到 /', () => {
    // Mock window.location
    const originalHref = window.location.href
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    })

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    )

    fireEvent.click(screen.getByText('回首页'))
    expect(window.location.href).toBe('/')

    // 恢复
    Object.defineProperty(window, 'location', {
      value: { href: originalHref },
      writable: true,
    })
  })

  it('调用 componentDidCatch 记录错误', () => {
    const consoleSpy = vi.spyOn(console, 'error')

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    )

    // console.error 被 React 和 ErrorBoundary 都调用了
    expect(consoleSpy).toHaveBeenCalled()
  })
})
