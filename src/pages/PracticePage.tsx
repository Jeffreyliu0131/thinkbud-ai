import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Clock3, Lightbulb, Pause, Play, Sprout } from 'lucide-react'
import {
  appendPracticeEvent, createPractice, gradeAnswer, parsePracticeNumbers, practiceExport, practiceState,
  REVIEW_PREVIEW_TASK, taskFor, type CoachingPolicy, type PracticeEvent, type PracticeRecord,
  type PracticeSession, type PracticeStage, type PracticeState, type PracticeTask,
} from '../lib/practice'
import { clearPractice, loadPractice, savePractice } from '../lib/practiceStorage'
import './PracticePage.css'

type WithoutTime<T> = T extends { at: number } ? Omit<T, 'at'> : never
type PracticeAction = WithoutTime<PracticeEvent>

const STAGE_LABELS: Record<PracticeStage, string> = { coach: '引导练习', transfer: '独立迁移', review: '延迟复测' }
const OUTCOME_LABELS: Record<PracticeRecord['outcome'], string> = {
  'coached-completion': '在步骤引导下完成', 'first-attempt-without-hints': '无站内提示，首次作答完成',
  'completed-after-retry': '重试后完成', 'needed-support': '需要帮助，已返回练习',
}
function initialController() {
  try {
    const loaded = loadPractice(window.localStorage, Date.now())
    return { ...loaded, remember: loaded.session !== null }
  } catch { return { session: null as PracticeSession | null, notice: '浏览器存储不可用，可在当前页面体验。', remember: false } }
}
function equation(task: PracticeTask) { return `${task.a} × (${task.b} + ${task.c})` }

function OtherExample() {
  return <aside className="practice-example" aria-label="换一个例子"><div><Lightbulb size={19} aria-hidden /><strong>换一个例子，看清同一件事</strong></div>
    <p>有 3 袋苹果，每袋有 2 个红苹果和 5 个青苹果。可以先数每袋，也可以把两种苹果分别数。</p>
    <div className="apple-bags" aria-hidden>{[0, 1, 2].map(bag => <div key={bag}>{[0, 1].map(dot => <i className="red-apple" key={`r${dot}`} />)}{[0, 1, 2, 3, 4].map(dot => <i key={`g${dot}`} />)}</div>)}</div>
    <p className="example-equation">3 × (2 + 5) = 3 × 2 + 3 × 5</p><p>两种苹果都出现了 3 次。回到原题，括号里的每一项分别出现了几次？</p>
  </aside>
}

function AnswerForm({ task, stage, step, paused, onAnswer }: {
  task: PracticeTask; stage: PracticeStage; step: number; paused: boolean; onAnswer: (values: number[]) => void;
}) {
  const [error, setError] = useState('')
  const expansion = stage !== 'coach' && step === 0
  const label = stage === 'coach' ? [
    '让括号里的两项都参与计算。空格里应该填什么？', '先算第一项。', '再算第二项。', '把你刚才算出的两部分合起来。',
  ][step] : expansion ? '独立把这道题展开成两个乘法。两项的顺序可以交换。' : '继续独立计算，写下整道题的结果。'
  const input = (index: number, name: string) => <input key={index} aria-label={name} name={`answer${index}`} type="text" inputMode="numeric" autoComplete="off" maxLength={5} autoFocus={index === 0} required />
  return <form className="practice-answer" onSubmit={event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    try {
      const values = parsePracticeNumbers(Array.from({ length: expansion ? 4 : 1 }, (_, index) => String(data.get(`answer${index}`) ?? '')))
      onAnswer(values); setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '请检查填写内容。') }
  }}>
    <fieldset disabled={paused}><legend>{label}</legend>
      <div className={`answer-equation ${expansion ? 'answer-expansion' : ''}`}>
        {expansion ? <><span>（{input(0, '第一项的第一个乘数')} × {input(1, '第一项的第二个乘数')}）</span><span>＋</span><span>（{input(2, '第二项的第一个乘数')} × {input(3, '第二项的第二个乘数')}）</span></>
          : <><span>{stage !== 'coach' ? equation(task) : step === 0 ? `(${task.a} × ${task.b}) + (` : step === 1 ? `${task.a} × ${task.b}` : step === 2 ? `${task.a} × ${task.c}` : `${task.a * task.b} + ${task.a * task.c}`}{stage === 'coach' && step === 0 ? '' : ' ='}</span>
            {input(0, '本步答案')}{stage === 'coach' && step === 0 && <span>× {task.c})</span>}</>}
      </div>
      {error && <p className="practice-error" role="alert">{error}</p>}
      <button className="practice-button" type="submit">提交这一步 <ArrowRight size={17} aria-hidden /></button>
    </fieldset>
  </form>
}

function ReviewPreview({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [message, setMessage] = useState('')
  return <section className="review-preview" aria-label="复测流程演示"><span className="practice-eyebrow">演示专用 · 不进入练习记录</span>
    <h2>预览延迟复测怎么进行</h2><p>使用另一道演示题。不会提前打开正式复测题，也不会改变等待时间或完成状态。</p>
    {step < 2 ? <><div className="practice-problem">{equation(REVIEW_PREVIEW_TASK)}</div>
      <AnswerForm key={step} task={REVIEW_PREVIEW_TASK} stage="review" step={step} paused={false} onAnswer={values => {
        if (gradeAnswer(REVIEW_PREVIEW_TASK, 'review', step, values)) { setStep(step + 1); setMessage('') }
        else setMessage('这一步还不匹配，可以继续尝试。')
      }} />{message && <p role="status">{message}</p>}</> : <p role="status" className="preview-complete">演示已走通。正式延迟复测仍未完成。</p>}
    <button type="button" className="practice-button practice-button-quiet" onClick={onClose}>关闭演示，返回等待</button>
  </section>
}

function EvidencePanel({ state }: { state: PracticeState }) {
  return <aside className="practice-evidence" aria-label="本次学习观察"><span className="practice-eyebrow">进度有依据</span><h2>这次实际观察到了什么</h2>
    {(['coach', 'transfer', 'review'] as const).map(stage => {
      const records = state.records.filter(record => record.stage === stage)
      const last = records.at(-1)
      const active = state.phase === stage
      return <div className="practice-observation" key={stage}><h3>{STAGE_LABELS[stage]}</h3>
        <strong>{active ? '当前题进行中' : last ? OUTCOME_LABELS[last.outcome] : stage === 'review' && state.reviewDueAt ? '等待间隔后再检查' : '尚未完成'}</strong>
        {active ? <p>{state.attempts} 次提交 · {state.mistakes} 次不匹配 · {state.hints} 次提示 · {state.examples} 次例子</p>
          : last && <p>{last.attempts} 次提交 · {last.mistakes} 次不匹配 · {last.hints} 次提示 · {last.examples} 次例子</p>}
        {active && last && <small>上次：{OUTCOME_LABELS[last.outcome]}。此前记录继续保留。</small>}
        {!active && records.length > 1 && <small>包含此前 {records.length - 1} 次记录，未覆盖失败。</small>}
      </div>
    })}
    <p className="observation-limit">“无站内提示”只描述本次操作。一次做对、成人模拟和设备时间都不能证明已经掌握或学习效果。</p>
    {state.records.length > 0 && <details><summary>查看每次记录</summary><ol>{state.records.map((record, index) => <li key={index}>
      {STAGE_LABELS[record.stage]} · {record.taskId} · {OUTCOME_LABELS[record.outcome]}<br />{new Date(record.finishedAt).toLocaleString()}
    </li>)}</ol></details>}
  </aside>
}

export default function PracticePage() {
  const [controller, setController] = useState(initialController)
  const controllerRef = useRef(controller)
  const [now, setNow] = useState(Date.now)
  const [preview, setPreview] = useState(false)
  const [actionError, setActionError] = useState('')
  const session = controller.session
  const state = session ? practiceState(session) : null
  const task = state ? taskFor(state) : null
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])

  const update = useCallback((next: typeof controller) => {
    controllerRef.current = next; setController(next)
  }, [])
  const persist = useCallback((next: PracticeSession, remember: boolean) => {
    let notice = ''
    if (remember) {
      try { notice = savePractice(window.localStorage, next) } catch { notice = '本设备无法保存；当前页面仍可继续。' }
    }
    update({ session: next, remember, notice })
  }, [update])
  const send = useCallback((action: PracticeAction) => {
    const event = { ...action, at: Date.now() } as PracticeEvent
    const current = controllerRef.current
    if (!current.session) return
    try { persist(appendPracticeEvent(current.session, event), current.remember); setActionError(''); setNow(event.at) }
    catch { setActionError('当前步骤无法执行此操作。请确认已恢复练习、复测已到期，且设备时间没有倒退。') }
  }, [persist])
  const handleStart = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (!data.has('adult')) return
    persist(createPractice(data.get('policy') as CoachingPolicy, Date.now()), data.has('remember'))
  }, [persist])
  const clear = () => {
    let notice = ''
    try { notice = clearPractice(window.localStorage) } catch { notice = '本设备存储不可用。' }
    update({ session: null, remember: false, notice }); setPreview(false); setActionError('')
  }
  const exportRecords = () => {
    if (!session) return
    const data = JSON.stringify(practiceExport(session, Date.now()), null, 2)
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'thinkbud-practice-observations.json'; anchor.hidden = true
    document.body.appendChild(anchor); anchor.click(); anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const stageIndex = !state || ['coach', 'transfer-ready'].includes(state.phase) ? 0 : state.phase === 'transfer' ? 1 : 2

  return <main className="practice-page"><nav className="practice-nav" aria-label="练习导航"><a href="/showcase"><Sprout size={24} aria-hidden /><strong>ThinkBud</strong></a>
    <a href="/showcase"><ArrowLeft size={15} aria-hidden /> 项目展示</a></nav>
    <header className="practice-header"><span className="practice-eyebrow">数学 · 四年级 · 分配律</span><h1>把一道题，学成一种方法。</h1>
      <p>先跟着练，再独立换题，最后隔一段时间检查。</p>
      <div className="practice-preview-note">成人体验原型 · 预设题目与教学提示，不调用模型。请勿输入真实儿童信息。</div>
    </header>
    {controller.notice && <p role="status" className="practice-storage-notice">{controller.notice}</p>}
    {!session || !state ? <section className="practice-start"><div><span className="practice-eyebrow">一条完整的练习路径</span><h2>学过，不急着算“掌握”。</h2>
      <ol><li><strong>引导练习</strong><span>一次处理一个步骤，卡住时换个例子。</span></li><li><strong>独立迁移</strong><span>新题不提供站内提示，重试与求助会单独记录。</span></li><li><strong>延迟复测</strong><span>24 小时后再试另一题，也可以预览流程。</span></li></ol></div>
      <form onSubmit={handleStart}><label>卡住时，教练怎么帮忙<select name="policy" defaultValue="example-after-struggle"><option value="example-after-struggle">连续两次困难后，换例子解释</option><option value="question-first">继续给一步提示</option></select></label>
        <label className="practice-checkbox"><input type="checkbox" name="adult" required /> 我以成人身份体验预设题目的流程</label>
        <label className="practice-checkbox"><input type="checkbox" name="remember" /> 在此设备保存已提交的进度，便于明天复测</label>
        <p>保存为匿名、本地预览记录，有效期 7 天，不关联账号、不写入学习掌握度。未勾选时，关闭或刷新页面即丢失进度。</p>
        <button className="practice-button" type="submit">开始引导练习 <ArrowRight size={18} aria-hidden /></button>
        {controller.notice && <button type="button" className="practice-link-button" onClick={clear}>清除本练习的旧记录</button>}
      </form></section> : <>
      <ol className="practice-stages" aria-label="练习阶段">{['引导练习', '独立迁移', '延迟复测'].map((label, index) => <li key={label} aria-current={index === stageIndex ? 'step' : undefined}><span>{index < stageIndex ? <Check size={17} aria-hidden /> : `0${index + 1}`}</span>{label}</li>)}</ol>
      <div className="practice-layout"><div className="practice-work"><section className="practice-card">
        <div className="practice-card-heading"><span className="practice-eyebrow">{task ? `${STAGE_LABELS[state.phase as PracticeStage]} · 第 ${state.step + 1} / ${state.phase === 'coach' ? 4 : 2} 步` : state.phase === 'waiting' ? '让时间也参与检验' : '本轮观察'}</span>
          {state.phase !== 'complete' && <button type="button" className="practice-link-button" onClick={() => send({ type: state.paused ? 'resume' : 'pause' })}>{state.paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}{state.paused ? '继续练习' : '暂停'}</button>}</div>
        {state.paused && <p className="practice-paused" role="status">已暂停。已提交的步骤和当前页面的填写内容会保留。</p>}
        {task && <><h2>{state.phase === 'coach' ? '每一步，都由你来完成。' : '换一道题，自己试试看。'}</h2><div className="practice-problem">{equation(task)}</div>
          {state.feedback !== 'none' && <p className="practice-feedback" role="status">{state.feedback === 'step-complete' ? '这一步已完成，继续下一步。' : '这一步还不匹配。可以重试；重试次数会保留在记录里。'}</p>}
          {state.help === 'example' && <OtherExample />}
          {state.help === 'hint' && <aside className="practice-hint"><Lightbulb size={18} aria-hidden /><span>{state.step === 0 ? '括号外的数，需要分别和括号内的每一项相乘。' : state.step === 3 ? '两部分都由你算出来了，现在把它们相加。' : '这一项表示同样的数重复几次。可以先想整十数，再处理余下部分。'}</span></aside>}
          <AnswerForm key={`${task.id}:${state.step}`} task={task} stage={state.phase as PracticeStage} step={state.step} paused={state.paused} onAnswer={values => send({ type: 'answer', taskId: task.id, step: state.step, values })} />
          <div className="practice-help-actions">{state.phase === 'coach' ? <><button disabled={state.paused} type="button" className="practice-link-button" onClick={() => send({ type: 'hint' })}>给我一步提示</button><button disabled={state.paused} type="button" className="practice-link-button" onClick={() => send({ type: 'example' })}>换个例子理解</button></> : <button disabled={state.paused} type="button" className="practice-link-button" onClick={() => send({ type: 'return-to-coach' })}>我需要帮助，回去练习</button>}</div>
          {state.phase !== 'coach' && <p className="practice-check-note">此处不提供站内提示。返回练习会记录本次求助，之后使用另一道迁移题。</p>}
        </>}
        {state.phase === 'transfer-ready' && <><h2>原题完成了。方法能迁移吗？</h2><p>下一题换了数字。独立完成展开和计算，才能记录为一次无站内提示的迁移表现。</p><button disabled={state.paused} className="practice-button" type="button" onClick={() => send({ type: 'start-transfer' })}>开始独立迁移 <ArrowRight size={18} aria-hidden /></button></>}
        {state.phase === 'waiting' && <><Clock3 className="practice-wait-icon" size={32} aria-hidden /><h2>先放一放，之后再检查。</h2><p>正式复测开放时间：<strong>{new Date(state.reviewDueAt!).toLocaleString()}</strong></p>
          <p>使用设备时间计算 24 小时间隔。提前预览不会完成正式复测。</p>
          <button className="practice-button" type="button" disabled={state.paused || now < state.reviewDueAt!} onClick={() => send({ type: 'start-review' })}>{now < state.reviewDueAt! ? '正式复测尚未到期' : '开始正式延迟复测'}</button>
          <button className="practice-button practice-button-quiet" type="button" disabled={state.paused} onClick={() => setPreview(true)}>预览复测流程（不计入记录）</button>
          {!controller.remember && <p className="practice-storage-notice">当前未保存进度。若要明天继续，请在下方开启本设备保存。</p>}
        </>}
        {state.phase === 'complete' && <><h2>{state.sampleLimitReached ? '这组样例先练到这里。' : '三段流程，留下三种观察。'}</h2><p>{state.sampleLimitReached ? '已保留求助与未完成记录，没有把它们改成通过。' : '这次题目的表现已记录。它不等同于长期掌握，也不是学习效果研究。'}</p><button className="practice-button" type="button" onClick={exportRecords}>导出本次观察记录</button></>}
        {actionError && <p role="alert" className="practice-error">{actionError}</p>}
      </section>
      {preview && state.phase === 'waiting' && <ReviewPreview onClose={() => setPreview(false)} />}
      <section className="practice-session-tools"><label className="practice-checkbox"><input type="checkbox" checked={controller.remember} onChange={event => {
        if (event.target.checked) persist(session, true)
        else { let notice = ''; try { notice = clearPractice(window.localStorage) } catch { notice = '本地记录未能清除。' }; update({ ...controller, remember: false, notice }) }
      }} /> 在此设备保存已提交的进度（7 天有效）</label><p>原型记录只在本设备，不进入账号或家长报告。当前输入框中的未提交内容不会保存。</p>
        <div><button className="practice-link-button" type="button" onClick={exportRecords}>导出观察记录</button><button className="practice-link-button" type="button" onClick={clear}>清除本次记录并重新开始</button></div>
      </section></div><EvidencePanel state={state} /></div>
      </>}
  </main>
}
