// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { ToastProvider, useToast } from '../Toast'

// 测试组件：触发 toast 的按钮
function TestTrigger({ message, type }: { message: string; type?: 'error' | 'info' | 'success' }) {
  const { showToast } = useToast()
  return <button onClick={() => showToast(message, type)}>触发</button>
}

afterEach(() => cleanup())

function renderWithProvider(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

describe('Toast', () => {
  it('showToast 后显示消息', () => {
    renderWithProvider(<TestTrigger message="测试消息" />)
    fireEvent.click(screen.getByText('触发'))
    expect(screen.getByText('测试消息')).toBeDefined()
  })

  it('3 秒后自动消失', () => {
    vi.useFakeTimers()
    renderWithProvider(<TestTrigger message="会消失的" />)
    fireEvent.click(screen.getByText('触发'))
    expect(screen.getByText('会消失的')).toBeDefined()

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.queryByText('会消失的')).toBeNull()
    vi.useRealTimers()
  })

  it('点击 ✕ 手动关闭', () => {
    renderWithProvider(<TestTrigger message="手动关闭" />)
    fireEvent.click(screen.getByText('触发'))
    expect(screen.getByText('手动关闭')).toBeDefined()

    fireEvent.click(screen.getByText('✕'))
    expect(screen.queryByText('手动关闭')).toBeNull()
  })

  it('error 类型显示 ⚠️ 图标', () => {
    renderWithProvider(<TestTrigger message="错误消息" type="error" />)
    fireEvent.click(screen.getByText('触发'))
    expect(screen.getByText('⚠️')).toBeDefined()
  })

  it('info 类型显示 ℹ️ 图标', () => {
    renderWithProvider(<TestTrigger message="信息" type="info" />)
    fireEvent.click(screen.getByText('触发'))
    expect(screen.getByText('ℹ️')).toBeDefined()
  })

  it('success 类型显示 ✅ 图标', () => {
    renderWithProvider(<TestTrigger message="成功" type="success" />)
    fireEvent.click(screen.getByText('触发'))
    expect(screen.getByText('✅')).toBeDefined()
  })

  it('默认 type 为 error', () => {
    renderWithProvider(<TestTrigger message="默认错误" />)
    fireEvent.click(screen.getByText('触发'))
    expect(screen.getByText('⚠️')).toBeDefined()
  })

  it('多个 toast 同时显示', () => {
    function MultiTrigger() {
      const { showToast } = useToast()
      return (
        <>
          <button onClick={() => showToast('消息A', 'info')}>触发A</button>
          <button onClick={() => showToast('消息B', 'success')}>触发B</button>
        </>
      )
    }

    renderWithProvider(<MultiTrigger />)
    fireEvent.click(screen.getByText('触发A'))
    fireEvent.click(screen.getByText('触发B'))
    expect(screen.getByText('消息A')).toBeDefined()
    expect(screen.getByText('消息B')).toBeDefined()
  })

  it('useToast 在 Provider 外抛异常', () => {
    function Orphan() {
      useToast()
      return null
    }

    expect(() => render(<Orphan />)).toThrow('useToast must be used within ToastProvider')
  })
})
