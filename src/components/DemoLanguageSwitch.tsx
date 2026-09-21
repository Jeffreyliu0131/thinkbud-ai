import { Languages } from 'lucide-react'
import { useDemoLocale, type LanguagePreference } from '../lib/demoLocale'
import './DemoLanguageSwitch.css'

export default function DemoLanguageSwitch() {
  const { locale, preference, setLanguage } = useDemoLocale()
  return <label className="demo-language">
    <Languages size={16} aria-hidden="true" />
    <select aria-label="Language / 语言" value={preference} onChange={event => setLanguage(event.target.value as LanguagePreference)}>
      <option value="system">{locale === 'zh' ? '跟随系统' : 'System'}</option>
      <option value="zh" lang="zh-CN">中文</option>
      <option value="en" lang="en">English</option>
    </select>
  </label>
}
