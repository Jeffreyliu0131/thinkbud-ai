import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KnowledgeExplorer, SubjectExplorer, SubjectPreview } from './ShowcaseExplorer'
import { setDemoLanguage } from '../lib/demoLocale'

beforeEach(() => { vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']); setDemoLanguage('system') })
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); setDemoLanguage('system') })

describe('source-grounded subject exploration', () => {
  it('switches subject and band without leaking the previous topic or learner state', async () => {
    const user = userEvent.setup()
    render(<SubjectExplorer />)
    expect(screen.getByRole('heading', { name: '计算与分配律' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '我尝试了一步' }))
    expect(screen.getByText('先算 6 × 10，再算 6 × 4。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '语文' }))
    await user.click(screen.getByRole('button', { name: /作文构思/ }))
    expect(screen.getByText(/作文是开放表达：可以给结构/)).toBeInTheDocument()
    expect(screen.queryByText('先算 6 × 10，再算 6 × 4。')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '我卡住了' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '我想结束' }))
    expect(screen.getByText('好，今天先到这里。需要时我们再一起想。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '1–3 年级' }))
    expect(screen.getByRole('heading', { name: '拼音与声调' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /作文构思/ })).not.toBeInTheDocument()
  })
  it('preserves the selected task across locale changes and explains rules without filling the answer', async () => {
    const user = userEvent.setup()
    render(<SubjectExplorer />)
    await user.click(screen.getByRole('button', { name: '英语' }))
    await user.click(screen.getByRole('button', { name: '我尝试了一步' }))
    expect(screen.getByText(/一般现在时的第三人称单数/)).toBeInTheDocument()
    act(() => setDemoLanguage('en'))
    expect(screen.getByRole('heading', { name: 'Grammar choices' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'I tried a step' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/the learner applies them/)).toBeInTheDocument()
    expect(screen.queryByText('主语是 he。')).not.toBeInTheDocument()
  })
  it('updates the first-screen preview for all three subjects', async () => {
    const user = userEvent.setup()
    render(<SubjectPreview jumpTo={vi.fn()} />)
    const group = screen.getByRole('group', { name: '预览学科' })
    await user.click(within(group).getByRole('button', { name: '语文' }))
    expect(screen.getByText('你想写哪一次具体的经历？')).toBeInTheDocument()
    await user.click(within(group).getByRole('button', { name: '英语' }))
    expect(screen.getByText('先找主语：这里是谁去学校？')).toBeInTheDocument()
  })
})

describe('knowledge mechanism illustration', () => {
  it('keeps neutral observations neutral, resets when changing concepts and never persists a learner record', async () => {
    const user = userEvent.setup()
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<KnowledgeExplorer />)
    const meter = () => screen.getByRole('meter')
    expect(meter()).toHaveAttribute('value', '0.5')
    await user.click(screen.getByRole('button', { name: '积极信号' }))
    const positive = Number(meter().getAttribute('value'))
    expect(positive).toBeGreaterThan(0.5)
    await user.click(screen.getByRole('button', { name: '中性信号' }))
    expect(Number(meter().getAttribute('value'))).toBe(positive)
    await user.click(screen.getByRole('button', { name: '困难信号' }))
    expect(Number(meter().getAttribute('value'))).toBeLessThan(positive)
    await user.click(screen.getByRole('button', { name: '分数通分' }))
    expect(meter()).toHaveAttribute('value', '0.5')
    expect(screen.getByText('示例观察次数：0 / 12')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '语文' }))
    expect(screen.queryByRole('button', { name: '分数通分' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '声母韵母拆分' })).toHaveAttribute('aria-pressed', 'true')
    expect(storage).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
