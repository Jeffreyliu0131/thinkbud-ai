import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, BookOpen, GitBranch, RotateCcw } from 'lucide-react'
import { useDemoLocale } from '../lib/demoLocale'
import { demoRoute } from '../lib/demoPaths'
import { KNOWLEDGE_EN, TOPICS, type Copy, type ShowcaseBand, type ShowcaseSubject } from '../lib/showcaseContent'
import { KC_VOCABULARY } from '../../shared/kcVocabulary'
import { DEFAULT_BKT_PARAMS, updateBKT } from '../../shared/bkt'
import './ShowcaseExplorer.css'

const subjects: { id: ShowcaseSubject; label: Copy }[] = [
  { id: 'math', label: ['数学', 'Maths'] }, { id: 'chinese', label: ['语文', 'Chinese'] }, { id: 'english', label: ['英语', 'English'] },
]
const sourceRoot = 'https://github.com/Jeffreyliu0131/thinkbud-ai/blob/main/'
function Source({ path, children }: { path: string; children: React.ReactNode }) {
  return <a className="sx-source" href={`${sourceRoot}${path}`} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={13} aria-hidden="true" /></a>
}
function useCopy() {
  const { locale } = useDemoLocale()
  return (zh: string, en: string) => locale === 'zh' ? zh : en
}
export function ShowcaseIntro({ jumpTo }: { jumpTo: (id: string) => void }) {
  const c = useCopy()
  return <section className="sx-summary" aria-label={c('项目导览', 'Project overview')}>
    {[
      ['01', '选一道真实场景', 'Choose a scenario', '三科学段策略与代表题型。看同一道题应该怎样引导。', 'Subject and age-band policies, shown through concrete examples.', 'subject-explorer'],
      ['02', '看一次教学决策', 'Inspect a teaching decision', '卡住、尝试、想停下来，教练应该给出不同的下一步。', 'See how support changes when a learner is stuck, tries, or wants to stop.', 'subject-explorer'],
      ['03', '追到实现与依据', 'Trace it to the implementation', '思考链、知识点观察、RAG 与输出检查，各自解决什么问题。', 'Explore thinking traces, knowledge observations, RAG and output checks.', 'knowledge-explorer'],
    ].map(([n, zh, en, detail, detailEn, id]) => <button key={n} onClick={() => jumpTo(id)}><span>{n}</span><div><strong>{c(zh, en)}</strong><p>{c(detail, detailEn)}</p></div><ArrowRight size={16} aria-hidden="true" /></button>)}
  </section>
}

export function SubjectExplorer() {
  const c = useCopy()
  const txt = (copy: Copy) => c(...copy)
  const [subject, setSubject] = useState<ShowcaseSubject>('math')
  const [band, setBand] = useState<ShowcaseBand>('upper')
  const [topicId, setTopicId] = useState('distributive')
  const [signal, setSignal] = useState<'stuck' | 'attempt' | 'stop'>('stuck')
  const topics = TOPICS.filter(topic => topic.subject === subject && topic.band === band)
  const topic = topics.find(topic => topic.id === topicId) ?? topics[0]
  const changeSubject = (value: ShowcaseSubject) => { setSubject(value); setTopicId(''); setSignal('stuck') }
  const changeBand = (value: ShowcaseBand) => { setBand(value); setTopicId(''); setSignal('stuck') }
  const isWriting = topic.id === 'writing' || topic.id === 'picture'
  return <section id="subject-explorer" tabIndex={-1} className="sx-chapter">
    <div className="sx-heading"><p className="tb-kicker">01 / {c('学科与教学', 'SUBJECTS & TEACHING')}</p><h2>{c('不同的题，需要不同的帮助。', 'Different questions need different kinds of help.')}</h2><p>{c('选择学科、学段和题型。下面的题目与对话是按源码策略编写的展示样例，可以切换查看，不是模型现场生成。', 'Choose a subject, age band and task. These authored examples illustrate the policies in the source; switching them does not call a model.')}</p></div>
    <div className="sx-toolbar">
      <div className="sx-segment" role="group" aria-label={c('选择学科', 'Choose subject')}>{subjects.map(item => <button key={item.id} aria-pressed={subject === item.id} onClick={() => changeSubject(item.id)}>{txt(item.label)}</button>)}</div>
      <div className="sx-segment sx-segment--band" role="group" aria-label={c('选择学段', 'Choose age band')}>{(['lower', 'upper'] as const).map(value => <button key={value} aria-pressed={band === value} onClick={() => changeBand(value)}>{value === 'lower' ? c('1–3 年级', 'Grades 1–3') : c('4–6 年级', 'Grades 4–6')}</button>)}</div>
    </div>
    <div className="sx-grade"><BookOpen size={19} aria-hidden="true" /><div><strong>{band === 'lower' ? c('具体事物、小步骤、行为层提问', 'Concrete objects, small steps, questions about actions') : c('半抽象表达、归纳规律、解释策略', 'Introduce abstraction, patterns and questions about strategy')}</strong><p>{band === 'lower' ? c('如“你刚才用了什么办法？”提示词把单轮回复目标设为 25 字以内。', 'For example: “What did you just do?” The prompt targets replies within 25 Chinese characters.') : c('如“哪一步是关键？”提示词把单轮回复目标设为 50 字以内。', 'For example: “Which step mattered?” The prompt targets replies within 50 Chinese characters.')}</p></div></div>
    <p className="sx-note">{c('分龄依据是代码中的两个学段，不是逐年级教材目录或已验证的课程覆盖。英语学科原始辅导策略使用中文解释；这里的 English 是展示页面译文。', 'The code has two age bands, not a year-by-year curriculum. English-subject coaching is designed to explain in Chinese; English here is the walkthrough translation.')}</p>
    <div className="sx-workspace">
      <div className="sx-topic-list" role="group" aria-label={c('代表题型', 'Representative tasks')}>{topics.map((item, index) => <button key={item.id} aria-pressed={item.id === topic.id} onClick={() => { setTopicId(item.id); setSignal('stuck') }}><span>{String(index + 1).padStart(2, '0')}</span><strong>{txt(item.title)}</strong><ArrowRight size={15} aria-hidden="true" /></button>)}</div>
      <article className="sx-topic" aria-live="polite" aria-atomic="true">
        <div className="sx-topic__meta"><span>{c('代表题目 · 自编样例', 'REPRESENTATIVE TASK · AUTHORED EXAMPLE')}</span><span>{txt(subjects.find(item => item.id === subject)!.label)} / {band === 'lower' ? '1–3' : '4–6'}</span></div>
        <h3>{txt(topic.title)}</h3><p className="sx-question">{txt(topic.question)}</p>
        <div className="sx-method"><span>{c('策略工具箱', 'POLICY TOOLBOX')}</span><p>{txt(topic.method)}</p></div>
        <div className="sx-signal" role="group" aria-label={c('预设学习者状态', 'Preset learner state')}>
          <span>{c('换一种学习者状态，看看下一步', 'Change the learner state to inspect the next move')}</span>
          <div>{(['stuck', 'attempt', 'stop'] as const).map(value => <button key={value} aria-pressed={signal === value} onClick={() => setSignal(value)}>{value === 'stuck' ? c('我卡住了', 'I am stuck') : value === 'attempt' ? c('我尝试了一步', 'I tried a step') : c('我想结束', 'I want to stop')}</button>)}</div>
        </div>
        <div className="sx-dialogue">
          <p><span>{c('学习者 · 预设', 'LEARNER · PRESET')}</span>{signal === 'stuck' ? c('我不知道怎么继续。', 'I do not know how to continue.') : signal === 'attempt' ? txt(topic.attempt) : c('我不想做了，今天先到这里。', 'I want to stop for today.')}</p>
          <p><span>ThinkBud · {c('预设引导', 'PRESET COACHING')}</span>{signal === 'stuck' ? txt(topic.prompt) : signal === 'attempt' ? txt(topic.next) : c('好，今天先到这里。需要时我们再一起想。', 'Okay, let us stop here. We can think it through together another time.')}</p>
        </div>
        <p className="sx-decision"><strong>{c('为什么这样回应', 'Why this response')}</strong>{signal === 'stop' ? c('明确拒绝时结束。参与意愿优先，不强迫完成教学目标。', 'An explicit request to stop ends the session. Willing participation takes priority.') : signal === 'stuck' ? c('把注意力缩到一个具体动作。一次只推进一件事，避免把“再想想”变成压力。', 'Focus on one concrete action. One teaching move per turn gives the learner somewhere to start.') : c('承接学习者已经表达的思路，再推进一步。学生尝试和教练提供的帮助需要分开记录。', 'Build on the reasoning the learner has already expressed. Keep their contribution separate from the help provided.')}</p>
        <div className="sx-completion"><strong>{c('怎样收束这类任务', 'How this task ends')}</strong><p>{isWriting ? c('作文是开放表达：可以给结构，不代写句子。学生表示写完后，基于实际写作行为收尾；不自动再写一篇，也不据此判定掌握。', 'Writing is open-ended: offer structure, not finished sentences. Close when the learner says it is complete, acknowledge observed actions, and do not automatically assign another essay or infer mastery.') : subject === 'english' ? c('词义和语法规则可以直接解释，应用规则仍由学生完成。普通对话只有在学生主动要求时才追加变式练习。', 'Definitions and grammar rules can be explained directly; the learner applies them. Ordinary chat adds a transfer exercise only when requested.') : c('先看学生是否给出过程，再决定验证或收尾。普通对话按学生意愿追加新题；下方数学实验另设独立作答与延迟观察。', 'Use the learner’s reasoning to decide whether to check or close. Ordinary chat adds new questions on request; the separate maths experiment explicitly tests independent work and a later check.')}</p></div>
        {topic.id === 'distributive' && <a className="tb-button tb-button--primary sx-practice" href={demoRoute('/practice')}>{c('亲自完成这条数学路径', 'Try this maths workflow')}<ArrowRight size={15} aria-hidden="true" /></a>}
      </article>
    </div>
    <div className="sx-sources"><Source path={`functions/_shared/prompt/subjects/${subject}.ts`}>{c('学科策略源码', 'Subject policy')}</Source><Source path="functions/_shared/prompt/grade-adapters.ts">{c('学段适配源码', 'Age-band adapters')}</Source><Source path="functions/_shared/prompt/core.ts">{c('回合与情绪规则', 'Turn and emotion rules')}</Source></div>
  </section>
}

export function KnowledgeExplorer() {
  const c = useCopy()
  const [subject, setSubject] = useState<ShowcaseSubject>('math')
  const [concept, setConcept] = useState('round_split')
  const [observations, setObservations] = useState<Array<'positive' | 'struggle' | 'neutral'>>([])
  const points = KC_VOCABULARY.filter(point => point.subject === subject)
  const selected = points.find(point => point.concept === concept) ?? points[0]
  const confidence = observations.reduce((prior, signal) => signal === 'neutral' ? prior : updateBKT(prior, signal === 'positive'), DEFAULT_BKT_PARAMS.pL0)
  const label = (point: typeof selected) => c(point.label, KNOWLEDGE_EN[point.concept] ?? point.concept.replaceAll('_', ' '))
  return <section id="knowledge-explorer" tabIndex={-1} className="sx-chapter">
    <div className="sx-heading"><p className="tb-kicker">03 / {c('思考链与知识点', 'THINKING TRACES & KNOWLEDGE')}</p><h2>{c('记住如何思考，也记住哪里需要帮助。', 'Remember the reasoning—and where help was needed.')}</h2><p>{c('一次对话的过程，与多次对话积累的知识点信号，各有用途。代码里的“树”并不是一套已经验证的先修课程图。', 'A trace of one conversation and knowledge signals across conversations serve different purposes. The implemented “tree” is not a validated prerequisite curriculum.')}</p></div>
    <div className="sx-traces">
      <div><h3>{c('本次：思考链', 'Within a session: the thinking trace')}</h3><p>{c('保留学生回答、教练引导、思考节点与情绪标签，回看是谁完成了哪一步。以下为预设示意。', 'Review learner turns, coach prompts, thinking-node labels and emotion tags. This sequence is an authored illustration.')}</p><ol className="sx-timeline">{[
        ['聚焦条件 · 教练', 'Focus · coach', '“括号里有哪两项？”', '“Which two terms are inside the brackets?”'],
        ['提出方法 · 学习者', 'Method · learner', '“先分别乘，再加起来。”', '“Multiply each part, then add them.”'],
        ['验证过程 · 教练', 'Check · coach', '“两个部分都保留了 6 吗？”', '“Does each part still include the 6?”'],
      ].map(([zh, en, body, bodyEn]) => <li key={en}><strong>{c(zh, en)}</strong><p>{c(body, bodyEn)}</p></li>)}</ol><Source path="src/components/ThinkingTree.tsx">{c('思考链组件', 'Thinking-trace component')}</Source></div>
      <div><h3>{c('跨会话：知识点观察', 'Across sessions: knowledge observations')}</h3><p>{c('从对话中提取有限词表内的知识点，累计积极、困难或不明确信号，再调整下次引导的上下文。', 'Extract concepts from a controlled vocabulary; accumulate positive, struggle or neutral signals to inform the next session.')}</p><ol className="sx-timeline">{[
        ['识别知识点', 'Identify a concept', '按学科约束词表，过滤未知概念。', 'Constrain extraction by subject; filter unknown concepts.'],
        ['积累观察', 'Accumulate observations', '服务端 D1 与本地 IndexedDB；BKT 更新内部估计。', 'Retained D1 and IndexedDB paths; BKT updates an internal estimate.'],
        ['调整下一次帮助', 'Adapt the next context', '按次数、时间衰减与信号，选出需引导点与较久未练习点。', 'Use encounters, decay and signals to select areas needing support or review.'],
      ].map(([zh, en, body, bodyEn]) => <li key={en}><strong>{c(zh, en)}</strong><p>{c(body, bodyEn)}</p></li>)}</ol><Source path="src/lib/knowledgeGraph.ts">{c('知识上下文构建', 'Knowledge-context builder')}</Source></div>
    </div>
    <div className="sx-vocabulary">
      <div className="sx-vocabulary__header"><div><h3>{c('探索源码中的知识点目录', 'Explore the vocabulary in the source')}</h3><p>{c('直接读取项目词表；分组是年级提示，不代表教学顺序或课程完备性。', 'Read directly from the project vocabulary. Groups are grade hints, not teaching order or proof of curriculum coverage.')}</p></div><div className="sx-segment" role="group" aria-label={c('知识点学科', 'Knowledge subject')}>{subjects.map(item => <button key={item.id} aria-pressed={subject === item.id} onClick={() => { setSubject(item.id); setObservations([]) }}>{c(...item.label)}</button>)}</div></div>
      <div className="sx-knowledge-grid"><div className="sx-branches">{(['lower', 'upper', 'both'] as const).map(band => {
        const group = points.filter(point => point.gradeHint === band)
        return group.length ? <div key={band}><h4>{band === 'lower' ? c('1–3 年级提示', 'Grades 1–3 hint') : band === 'upper' ? c('4–6 年级提示', 'Grades 4–6 hint') : c('跨学段', 'Across bands')} <span>{group.length}</span></h4><div>{group.map(point => <button key={point.concept} aria-pressed={selected.concept === point.concept} onClick={() => { setConcept(point.concept); setObservations([]) }}>{label(point)}</button>)}</div></div> : null
      })}</div>
      <div className="sx-observation" aria-live="polite"><span className="tb-kicker">{c('本地机制演示 · 合成信号', 'LOCAL MECHANISM · SYNTHETIC SIGNALS')}</span><h3>{label(selected)}</h3><code>{selected.concept}</code><p>{c('试着加入一次对话信号。这里运行项目的 BKT 公式，仅改变这个示例，不保存到任何学习记录。', 'Add a conversation signal. This runs the project’s BKT function, changes only this illustration, and saves no learner record.')}</p><label htmlFor="sx-estimate">{c('内部模型估计', 'Internal model estimate')} <strong>{Math.round(confidence * 100)}%</strong></label><meter id="sx-estimate" min="0" max="1" value={confidence}>{Math.round(confidence * 100)}%</meter><p className="sx-note">{c('不是掌握率。参数和对话信号尚未通过真实学习者校准；中性信号增加次数，不改变估计。', 'Not a measured mastery rate. Parameters and dialogue signals are uncalibrated on real learners. Neutral signals add an encounter without changing the estimate.')}</p><div className="sx-observation__buttons">{(['positive', 'struggle', 'neutral'] as const).map(signal => <button key={signal} disabled={observations.length >= 12} onClick={() => setObservations(previous => [...previous, signal])}>{signal === 'positive' ? c('积极信号', 'Positive signal') : signal === 'struggle' ? c('困难信号', 'Struggle signal') : c('中性信号', 'Neutral signal')}</button>)}</div><p>{c('示例观察次数', 'Example encounters')}：{observations.length} / 12</p><button className="sx-reset" onClick={() => setObservations([])}><RotateCcw size={14} aria-hidden="true" />{c('重置示例', 'Reset example')}</button></div></div>
    </div>
    <p className="sx-callout">{c('设计取舍：对话中的“答对”可能来自提示，不能直接当作独立掌握。因此，知识估计与数学练习里的独立作答记录保持分离。当前公开页不连接知识提取服务或真实学习档案。', 'Design choice: a correct conversational response may depend on help. Knowledge estimates therefore remain separate from independent-practice observations. This public page does not connect to extraction services or real learner profiles.')}</p>
    <div className="sx-sources"><Source path="shared/kcVocabulary.ts">{c('知识点词表', 'Concept vocabulary')}</Source><Source path="functions/api/extract-knowledge.ts">{c('提取与持久化', 'Extraction and persistence')}</Source><Source path="shared/bkt.ts">{c('BKT 更新公式', 'BKT update function')}</Source></div>
  </section>
}

export function SystemExplorer({ jumpTo }: { jumpTo: (id: string) => void }) {
  const c = useCopy()
  return <>
    <section id="system-explorer" tabIndex={-1} className="sx-chapter">
      <div className="sx-heading"><p className="tb-kicker">04 / {c('AI 与 RAG', 'AI & RAG')}</p><h2>{c('模型负责生成，系统决定给它什么、放行什么。', 'The model generates. The system controls context and delivery.')}</h2><p>{c('保留的服务端实现把教学策略、学习观察和参考资料分开处理。公开页面展示机制与离线结果，不连接这些真实服务。', 'The retained service separates teaching policy, learner observations and reference material. This page demonstrates mechanisms and offline results without connecting to live services.')}</p></div>
      <ol className="sx-pipeline">{[
        ['接收问题', 'Receive the question', '文字 / OCR / 语音转文字；先清洗输入，把题目视为待分析的数据。', 'Text, OCR or transcribed speech; sanitise input and treat the problem as data.'],
        ['组装教学上下文', 'Assemble teaching context', '共享回合规则 + 学段适配 + 单科学科工具箱 + 会话状态。', 'Shared turn rules + age adapter + one subject toolbox + session state.'],
        ['补充有边界的依据', 'Add bounded evidence', '学习历史提示需要怎样帮助；RAG 提供可追溯的内容参考。', 'Learner history informs support; RAG provides traceable reference content.'],
        ['模型生成与输出检查', 'Generate and check', '短文本先完整缓冲，再拦截泄露答案等违规输出；通过后才展示或送入 TTS。', 'Buffer the short text response; block answer leakage before display or TTS.'],
        ['保留观察', 'Keep observations', '记录对话思考节点、知识信号与反馈，区分观察与能力推断。', 'Keep thinking nodes, knowledge signals and feedback; distinguish observations from ability claims.'],
      ].map(([zh, en, detail, detailEn], index) => <li key={en}><span>{String(index + 1).padStart(2, '0')}</span><h3>{c(zh, en)}</h3><p>{c(detail, detailEn)}</p></li>)}</ol>
      <div className="sx-rag-explainer"><div><h3>{c('知识点观察回答“这个学生可能卡在哪里”', 'Knowledge observations ask where this learner may need help')}</h3><p>{c('它来自学习对话，影响提示颗粒度。它不是教材事实来源，也不是独立掌握证明。', 'They come from learning conversations and influence the granularity of help. They are neither a textbook source nor proof of independent mastery.')}</p></div><div><h3>{c('RAG 回答“这次引导可以参考什么”', 'RAG asks what material can support this turn')}</h3><p>{c('从有来源的文档检索相关片段。资料作为低信任参考，不能改写教练规则，也不能冒充学生状态。', 'It retrieves relevant passages from sourced documents. References remain untrusted data and cannot override coaching policy or impersonate learner state.')}</p></div></div>
      <div className="sx-rag-flow"><p className="tb-kicker">{c('RAG 已实现的离线路径', 'IMPLEMENTED OFFLINE RAG PATH')}</p><ol>{[
        ['授权 Markdown / 文本', 'Authorised Markdown / text'], ['章节切块与版本哈希', 'Section chunks and version hashes'], ['学科、学段筛选与去重', 'Subject / grade filters and deduplication'], ['预算内片段与引用位置', 'Budgeted excerpts and citation locators'], ['低信任包装 → 模型 → 输出检查', 'Untrusted wrapper → model → output guard'],
      ].map(([zh, en]) => <li key={en}>{c(zh, en)}</li>)}</ol><p>{c('已用确定性假 embedding 和内存索引做合成测试。Vectorize 只有适配层；真实教材、生产 embedding、持久化向量库和资料授权仍未接入。', 'Synthetic tests use deterministic fake embeddings and an in-memory index. Vectorize is adapter-only; real textbooks, production embeddings, durable vector storage and source authorisation remain unconnected.')}</p><button className="tb-button tb-button--quiet" onClick={() => jumpTo('rag-contract')}>{c('切换成功、无结果与故障，检查引用怎样变化', 'Inspect citations across success, no result and failure')}<ArrowRight size={16} aria-hidden="true" /></button></div>
      <p className="sx-callout">{c('取舍：文本先检查再发出，会增加首字等待；直接语音 RTC 无法沿用同一拦截保证，所以默认关闭。功能入口存在，不等于发布条件已经满足。', 'Trade-off: checking before delivery adds first-token latency. Managed RTC voice cannot inherit the same blocking guarantee and is off by default. An implemented feature does not establish release readiness.')}</p>
      <div className="sx-sources"><Source path="functions/_shared/prompt/index.ts">{c('Prompt 组装', 'Prompt assembly')}</Source><Source path="docs/TEXTBOOK_RAG.md">{c('RAG 合同与边界', 'RAG contract and limits')}</Source><Source path="docs/ARCHITECTURE.md">{c('完整架构', 'Architecture')}</Source></div>
    </section>
    <section id="product-decisions" tabIndex={-1} className="sx-chapter">
      <div className="sx-heading"><p className="tb-kicker">05 / {c('产品判断与实现范围', 'PRODUCT DECISIONS & DELIVERY')}</p><h2>{c('项目的价值，也在于这些取舍。', 'The product is shaped by its trade-offs.')}</h2></div>
      <div className="sx-decisions">{[
        ['为什么不直接给答案？', 'Why not give the answer?', '产品假设：更快完成作业，不等于形成可以再次使用的方法。一次一个认知动作，把关键步骤留给学习者。', 'Hypothesis: faster homework completion does not establish reusable understanding. One cognitive move per turn leaves the key work to the learner.'],
        ['为什么不一直追问？', 'Why not keep asking questions?', '“你再想想”也会增加负担。根据卡住、尝试和受挫信号缩小步骤，明确不想做时结束；参与优先。', '“Think again” can become a burden. Narrow the next step when the learner struggles and stop when they explicitly decline.'],
        ['为什么不把记录叫作掌握？', 'Why not call every success mastery?', '有提示地完成、独立完成、重试后完成与隔天表现分开记录；写作等开放题采用不同收束方式。', 'Separate assisted completion, independent work, retries and later performance. Open-ended writing needs a different closing policy.'],
        ['下一步怎样证明它有效？', 'What would establish effectiveness?', '先用真实模型样本与独立人工评审检查引导质量，再开展经授权的学习观察；当前不声称提分或真实用户效果。', 'Review fresh model samples with independent human raters, then run authorised learning observations. No score gains or real-user impact are claimed.'],
      ].map(([zh, en, detail, detailEn]) => <article key={en}><h3>{c(zh, en)}</h3><p>{c(detail, detailEn)}</p></article>)}</div>
      <div className="sx-coverage"><h3>{c('实现地图：哪些现在能体验，哪些留在源码里？', 'Implementation map: what runs here, and what remains in source?')}</h3><div className="sx-table-wrap"><table><thead><tr><th>{c('能力', 'Capability')}</th><th>{c('当前状态', 'Current state')}</th><th>{c('可复核依据', 'Inspectable source')}</th></tr></thead><tbody>{[
        ['数学练习闭环', 'Maths practice loop', '页面运行：答题、两种帮助策略、独立新题、24 小时门槛、可选本地恢复与导出。', 'Runs here: answer checks, two help policies, new independent items, a 24-hour gate, optional local recovery and export.', 'src/lib/practice.ts'],
        ['三科与学段策略', 'Subject and age-band policies', '服务端 Prompt 已实现；本页按策略编写示例，未进行实时辅导。', 'Server prompt modules exist; this page presents authored policy examples, not live tutoring.', 'functions/_shared/prompt/index.ts'],
        ['思考链与知识观察', 'Thinking traces and knowledge observations', '源码含提取、BKT、存储和上下文注入；本页仅本地机制示例。', 'Source includes extraction, BKT, storage and context injection; only local illustrations run here.', 'src/lib/knowledgeExtractor.ts'],
        ['RAG 与模型网关', 'RAG and model gateway', '离线路径与合成检查已实现；真实教材、embedding 和向量索引未配置。', 'Offline path and synthetic checks exist; real textbooks, embeddings and vector infrastructure are unconfigured.', 'docs/TEXTBOOK_RAG.md'],
        ['拍照、语音、账号与家长视图', 'Camera, voice, accounts and parent view', '保留原型源码，本公开页未连接；RTC 默认关闭。', 'Retained prototype source, unconnected on this page; RTC is off by default.', 'docs/ARCHITECTURE.md'],
        ['真实教学质量与儿童使用', 'Live teaching quality and child use', '仍需真实模型、独立评审、隐私与授权验证。合成测试通过不能替代这些证据。', 'Needs live-model evidence, independent review, privacy and authorisation checks. Synthetic passes cannot replace them.', 'docs/RELEASE_CHECKLIST.md'],
      ].map(([zh, en, detail, detailEn, path]) => <tr key={path}><th scope="row">{c(zh, en)}</th><td>{c(detail, detailEn)}</td><td><Source path={path}>{c('查看依据', 'View source')}</Source></td></tr>)}</tbody></table></div></div>
      <p className="sx-note">{c('这些是项目机制与产物证据。代码、测试或页面存在，本身不证明个人独立实现能力或真实教学成效；实践闭环与本次展示实现包含 AI 辅助。', 'These are project mechanisms and artifacts. Code, tests and this page do not alone establish independent personal authorship or learning impact; the practice workflow and this showcase include AI-assisted implementation.')}</p>
      <div className="sx-sources"><Source path="docs/CASE_STUDY.md">{c('产品决策记录', 'Product decisions')}</Source><Source path="docs/FIELD_PILOT_PROTOCOL.md">{c('后续观察方案', 'Future observation protocol')}</Source><a className="sx-source" href="https://github.com/Jeffreyliu0131/thinkbud-ai" target="_blank" rel="noreferrer"><GitBranch size={14} aria-hidden="true" />{c('查看完整项目', 'Explore the repository')}</a></div>
    </section>
  </>
}

export function SubjectPreview({ jumpTo }: { jumpTo: (id: string) => void }) {
  const c = useCopy()
  const [subject, setSubject] = useState<ShowcaseSubject>('math')
  const previewId = subject === 'math' ? 'distributive' : subject === 'chinese' ? 'writing' : 'grammar'
  const topic = TOPICS.find(item => item.id === previewId)!
  return <div className="tb-hero__preview"><article className="tb-lesson sx-preview" aria-label={c('三科引导预览', 'Three-subject coaching preview')}>
    <div className="sx-preview__tabs" role="group" aria-label={c('预览学科', 'Preview subject')}>{subjects.map(item => <button key={item.id} onClick={() => setSubject(item.id)} aria-pressed={subject === item.id}>{c(...item.label)}</button>)}</div>
    <div className="tb-lesson__meta"><span>{c(...topic.title)}</span><span>{c('预设思考片段', 'PRESET THINKING EXCERPT')}</span></div>
    <h2 className="tb-lesson__title">{c('一次，只走一步', 'One step at a time')}</h2>
    <div className="sx-preview__content" aria-live="polite"><p className="sx-preview__question">{c(...topic.question)}</p><div className="tb-lesson__prompt"><BookOpen size={22} aria-hidden="true" /><div><strong>ThinkBud · {c('预设提示', 'PRESET PROMPT')}</strong><p>{c(...topic.prompt)}</p></div></div></div>
    <div className="tb-lesson__footer"><span>{c('不同学科，共同保留思考空间', 'Different subjects. Room to think.')}</span><button onClick={() => jumpTo('subject-explorer')}>{c('探索题型', 'Explore tasks')}<ArrowRight size={15} aria-hidden="true" /></button></div>
  </article><p className="tb-lesson__caption">{c('由源码策略编写的展示片段。切换学科，不调用模型。', 'Authored from the source policies. Switching subjects does not call a model.')}</p></div>
}


export function ChapterNav({ jumpTo }: { jumpTo: (id: string) => void }) {
  const c = useCopy()
  const [active, setActive] = useState('subject-explorer')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id)
    }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 })
    for (const id of ['subject-explorer', 'product-loop', 'knowledge-explorer', 'system-explorer', 'product-decisions']) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [])
  return <nav className="sx-chapter-nav" aria-label={c('模块导航', 'Module navigation')}>
    {[['subject-explorer', '学科题型', 'Subjects'], ['product-loop', '数学实操', 'Practice'], ['knowledge-explorer', '思考与知识', 'Knowledge'], ['system-explorer', 'AI 与 RAG', 'AI & RAG'], ['product-decisions', '决策与实现', 'Decisions']].map(([id, zh, en], index) => <button key={id} aria-current={active === id ? 'location' : undefined} onClick={() => jumpTo(id)}><span>{String(index + 1).padStart(2, '0')}</span>{c(zh, en)}</button>)}
  </nav>
}
