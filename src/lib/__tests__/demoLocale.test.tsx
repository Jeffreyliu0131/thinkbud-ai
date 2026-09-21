import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DemoLanguageSwitch from '../../components/DemoLanguageSwitch'
import { DEMO_LANGUAGE_KEY, resolveDemoLocale, setDemoLanguage, translateDemo, useDemoLocale } from '../demoLocale'

function Preview() {
  const { t } = useDemoLocale()
  return <><DemoLanguageSwitch /><h1>{t('开始数学体验')}</h1></>
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  setDemoLanguage('system')
})

describe('demo language preference', () => {
  it.each([
    [['zh-CN'], 'zh'], [['zh-TW'], 'zh'], [['zh-Hant-HK'], 'zh'],
    [['en-GB', 'zh'], 'en'], [['fr-FR', 'zh-CN'], 'zh'], [['fr-FR'], 'en'], [[], 'en'],
  ] as const)('uses supported browser preferences in order: %j', (languages, expected) => {
    expect(resolveDemoLocale(languages)).toBe(expected)
  })

  it('persists an explicit choice and can return to the changing system preference', async () => {
    const languages = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-US'])
    const user = userEvent.setup()
    const view = render(<Preview />)
    expect(screen.getByRole('heading')).toHaveTextContent('Try the maths demo')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language / 语言' }), 'zh')
    expect(localStorage.getItem(DEMO_LANGUAGE_KEY)).toBe('zh')
    view.unmount(); render(<Preview />)
    expect(screen.getByRole('heading')).toHaveTextContent('开始数学体验')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language / 语言' }), 'system')
    expect(screen.getByRole('heading')).toHaveTextContent('Try the maths demo')
    languages.mockReturnValue(['zh-CN'])
    act(() => window.dispatchEvent(new Event('languagechange')))
    expect(screen.getByRole('heading')).toHaveTextContent('开始数学体验')
  })

  it('stays usable when the browser blocks storage', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-US'])
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    render(<Preview />)
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Language / 语言' }), 'zh')
    expect(screen.getByRole('heading')).toHaveTextContent('开始数学体验')
  })

  it('keeps the current choice when reads work but saving the preference fails', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-US'])
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    render(<Preview />)
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Language / 语言' }), 'zh')
    expect(screen.getByRole('heading')).toHaveTextContent('开始数学体验')
  })

  it('interpolates observations and never resolves inherited dictionary properties', () => {
    expect(translateDemo('{{stage}} · 第 {{step}} / {{total}} 步', 'en', { stage: 'Guided practice', step: 2, total: 4 })).toBe('Guided practice · Step 2 of 4')
    expect(translateDemo('constructor', 'en')).toBe('constructor')
  })
})
