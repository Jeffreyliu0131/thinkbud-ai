import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PracticePage from '../PracticePage'
import App from '../../App'
import { appendPracticeEvent, createPractice, practiceState, PRACTICE_STORAGE_KEY, REVIEW_DELAY_MS, type PracticeSession } from '../../lib/practice'

beforeEach(() => { vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['zh-CN']) })

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })
async function submitSingle(user: ReturnType<typeof userEvent.setup>, value: string) {
  const input = screen.getByRole('textbox', { name: '本步答案' })
  await user.clear(input); await user.type(input, value)
  await user.click(screen.getByRole('button', { name: /提交这一步/ }))
}
async function submitExpansion(user: ReturnType<typeof userEvent.setup>, values: string[]) {
  for (const [index, name] of ['第一项的第一个乘数', '第一项的第二个乘数', '第二项的第一个乘数', '第二项的第二个乘数'].entries()) {
    const input = screen.getByRole('textbox', { name }); await user.clear(input); await user.type(input, values[index])
  }
  await user.click(screen.getByRole('button', { name: /提交这一步/ }))
}
function waitingSession(now: number): PracticeSession {
  let session = createPractice('example-after-struggle', now)
  for (const [step, value] of [6, 60, 24, 84].entries()) session = appendPracticeEvent(session, { type: 'answer', taskId: 'C1', step, values: [value], at: now + step + 1 })
  session = appendPracticeEvent(session, { type: 'start-transfer', at: now + 5 })
  session = appendPracticeEvent(session, { type: 'answer', taskId: 'T1', step: 0, values: [7, 20, 7, 3], at: now + 6 })
  return appendPracticeEvent(session, { type: 'answer', taskId: 'T1', step: 1, values: [161], at: now + 7 })
}

describe('PracticePage', () => {
  it('completes coaching and transfer without requests or implied mastery', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network expected'))
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/practice']}><App /></MemoryRouter>)
    await screen.findByRole('button', { name: /开始引导练习/ })
    await user.click(screen.getByRole('checkbox', { name: /我以成人身份/ }))
    await user.click(screen.getByRole('button', { name: /开始引导练习/ }))
    for (const value of ['6', '60', '24', '84']) await submitSingle(user, value)
    expect(screen.getByText('在步骤引导下完成')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /开始独立迁移/ }))
    expect(screen.queryByRole('button', { name: '给我一步提示' })).not.toBeInTheDocument()
    await submitExpansion(user, ['3', '7', '20', '7'])
    await submitSingle(user, '161')
    expect(screen.getByText('无站内提示，首次作答完成')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '正式复测尚未到期' })).toBeDisabled()
    expect(localStorage.getItem(PRACTICE_STORAGE_KEY)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('changes the help after repeated difficulty and preserves an unsubmitted field across pause', async () => {
    const user = userEvent.setup(); render(<PracticePage />)
    await user.click(screen.getByRole('checkbox', { name: /我以成人身份/ }))
    await user.click(screen.getByRole('button', { name: /开始引导练习/ }))
    await submitSingle(user, '1'); await submitSingle(user, '2')
    expect(screen.getByLabelText('换一个例子')).toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: '本步答案' })
    await user.clear(input); await user.type(input, '6')
    await user.click(screen.getByRole('button', { name: '暂停' }))
    expect(input).toHaveValue('6'); expect(input).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '继续练习' }))
    expect(input).toHaveValue('6'); expect(input).toBeEnabled()
  })

  it('keeps a completed preview separate from the stored delayed check', async () => {
    const now = Date.now(); const session = waitingSession(now - 1000)
    localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(session))
    const user = userEvent.setup(); render(<PracticePage />)
    await user.click(screen.getByRole('button', { name: '预览复测流程（不计入记录）' }))
    await submitExpansion(user, ['5', '10', '5', '7']); await submitSingle(user, '85')
    expect(screen.getByText('演示已走通。正式延迟复测仍未完成。')).toBeInTheDocument()
    expect(localStorage.getItem(PRACTICE_STORAGE_KEY)).toBe(JSON.stringify(session))
    expect(screen.getByRole('button', { name: '正式复测尚未到期' })).toBeDisabled()
  })

  it('unlocks a due saved check and uses the actual unseen review item', async () => {
    const session = waitingSession(Date.now() - REVIEW_DELAY_MS - 10000)
    localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(session))
    const user = userEvent.setup(); render(<PracticePage />)
    await user.click(screen.getByRole('button', { name: '开始正式延迟复测' }))
    expect(screen.getByText('8 × (30 + 2)')).toBeInTheDocument()
    await submitExpansion(user, ['8', '30', '8', '2']); await submitSingle(user, '256')
    const restored = JSON.parse(localStorage.getItem(PRACTICE_STORAGE_KEY)!) as PracticeSession
    expect(practiceState(restored).phase).toBe('complete')
    expect(practiceState(restored).records[2].taskId).toBe('R1')
  })
  it('detects English and switches language without resetting entries or submitted progress', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-SG'])
    const user = userEvent.setup(); render(<PracticePage />)
    expect(screen.getByRole('heading', { name: 'Turn one problem into a method.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start guided practice' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Confirm that you are an adult')
    await user.click(screen.getByRole('checkbox', { name: "I'm an adult exploring this preset workflow" }))
    await user.click(screen.getByRole('button', { name: 'Start guided practice' }))
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), '6')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language / 语言' }), 'zh')
    expect(screen.getByRole('textbox', { name: '本步答案' })).toHaveValue('6')
    await user.click(screen.getByRole('button', { name: '提交这一步' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language / 语言' }), 'en')
    expect(screen.getByText('Guided practice · Step 2 of 4')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'abc')
    await user.click(screen.getByRole('button', { name: 'Check this step' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 0 to 10000.')
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveAttribute('aria-invalid', 'true')
  })

})
