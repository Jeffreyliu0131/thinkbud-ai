import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import PracticePage from '../pages/PracticePage'
import { useDemoLocale } from '../lib/demoLocale'

/** A local disclosure: opening never navigates, closing preserves the mounted exercise. */
export default function InlinePractice() {
  const { locale } = useDemoLocale()
  const c = (zh: string, en: string) => locale === 'zh' ? zh : en
  const [open, setOpen] = useState(false)
  const [visited, setVisited] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = () => {
    setOpen(false)
    // Return to the named entry, not the top of the page. Only scroll if it left the viewport.
    window.requestAnimationFrame(() => {
      const button = trigger.current
      if (!button) return
      button.focus({ preventScroll: true })
      const rect = button.getBoundingClientRect()
      if (rect.top < 0 || rect.bottom > window.innerHeight) button.scrollIntoView({ block: 'center', behavior: 'auto' })
    })
  }
  return <div className="tb-inline-practice">
    <div className="tb-inline-practice__entry">
      <div><h3>{c('在这里，亲自试一题', 'Try a problem right here')}</h3><p>{c('练习在本节下方展开。随时收起，接着读；当前填写和进度会保留到本次页面关闭。', 'The exercise opens below. Collapse it whenever you want to keep reading; your current input and progress stay until this page is closed.')}</p></div>
      <button ref={trigger} className="tb-button tb-button--primary" type="button" aria-expanded={open} aria-controls="inline-maths-exercise" onClick={() => {
        if (open) close()
        else { setVisited(true); setOpen(true) }
      }}>{open ? c('收起练习', 'Collapse exercise') : visited ? c('继续刚才的练习', 'Resume this exercise') : c('展开数学练习', 'Open maths exercise')}{open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}</button>
    </div>
    <div id="inline-maths-exercise" className="tb-inline-practice__body" hidden={!open} role="region" aria-label={c('本节数学练习', 'Maths exercise in this section')}>
      {visited && <PracticePage embedded />}
      <div className="tb-inline-practice__exit"><button type="button" className="practice-link-button" onClick={close}><ChevronUp size={15} aria-hidden />{c('收起练习，回到本节说明', 'Collapse exercise and return to this section')}</button><p>{c('下一节：这些思考过程怎样留下观察记录。', 'Next: how these thinking processes become observations.')}</p></div>
    </div>
  </div>
}
