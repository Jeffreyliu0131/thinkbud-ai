import { PRACTICE_STORAGE_KEY, restorePractice, type PracticeSession } from './practice'

type LocalStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function loadPractice(store: LocalStore, now: number): { session: PracticeSession | null; notice: string } {
  try {
    const raw = store.getItem(PRACTICE_STORAGE_KEY)
    return raw ? { session: restorePractice(raw, now), notice: '已恢复本设备保存的练习进度。' } : { session: null, notice: '' }
  } catch {
    return { session: null, notice: '已有进度无法恢复，可能已过期、损坏或设备时间发生变化。可以清除本练习记录后重新开始。' }
  }
}
export function savePractice(store: LocalStore, session: PracticeSession): string {
  try { store.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(session)); return '' }
  catch { return '本设备暂时无法保存；已完成步骤仍保留在当前页面，请勿关闭页面。' }
}
export function clearPractice(store: LocalStore): string {
  try { store.removeItem(PRACTICE_STORAGE_KEY); return '' }
  catch { return '浏览器未允许清除本练习记录，请在浏览器站点存储中处理。' }
}
