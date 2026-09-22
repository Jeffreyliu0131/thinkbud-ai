import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SyntheticDemoPage from '../SyntheticDemoPage'

const behaviorReport = {
  generatedAt: '2026-08-27T00:00:00.000Z',
  sourceCommit: '1234567890abcdef1234567890abcdef12345678',
  sourceDirty: false,
  sourceSnapshotHash: 'snapshot',
  datasetHash: 'dataset',
  dataPolicy: 'synthetic only',
  summary: { total: 38, matched: 38, mismatched: 0 },
  coverage: {},
  gate: {
    passed: true,
    metrics: {
      positiveControlPassRate: 1,
      negativeControlDetectionRecall: 1,
      inputSafetyAccuracy: 1,
      failureRecoveryAccuracy: 1,
      telemetryBudgetAccuracy: 1,
    },
  },
  scope: {
    productionModelCalls: 0,
    realChildRecords: 0,
    modelGraderUsed: false,
    humanReviewStatus: 'not_run',
  },
}

const citation = {
  citationId: 'TB1',
  sourceId: 'src_synthetic',
  sourceTitle: 'Synthetic Upper Math Notes',
  documentId: 'doc_synthetic',
  documentTitle: 'Synthetic Upper Math Notes',
  chapterId: 'ch_synthetic',
  chapterTitle: 'Fraction Sense',
  sectionId: 'sec_synthetic',
  sectionTitle: 'Common denominators',
  chunkId: 'chk_synthetic',
  contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  locator: {
    sectionPath: 'Synthetic Upper Math Notes > Fraction Sense > Common denominators',
    pageStart: 1,
    pageEnd: 1,
    lineStart: 7,
    lineEnd: 7,
  },
}

const ragReport = {
  generatedAt: '2026-08-27T00:00:00.000Z',
  sourceCommit: '1234567890abcdef1234567890abcdef12345678',
  sourceDirty: false,
  sourceSnapshotHash: 'rag-snapshot',
  summary: { total: 14, passed: 14, failed: 0, goldQueries: 5, badCases: 9 },
  gate: {
    passed: true,
    metrics: {
      meanRecallAtK: 1,
      meanPrecisionAtK: 1,
      citationCorrectness: 1,
      badCasePassRate: 1,
    },
  },
  scope: {
    productionModelCalls: 0,
    fakeLlmCalls: 1,
    networkCalls: 0,
    realTextbookRecords: 0,
    realChildRecords: 0,
    vectorizeDeployment: false,
    productionEmbeddingProvider: false,
  },
  showcase: {
    runtimeStates: [
      { status: 'disabled', reason: 'flag false', citationCount: 0, truncated: false, citations: [] },
      { status: 'degraded', reason: 'service missing', citationCount: 0, truncated: false, citations: [] },
      { status: 'no_results', reason: 'no matching chunks', citationCount: 0, truncated: false, citations: [] },
      { status: 'used', reason: 'synthetic context attached', citationCount: 1, truncated: false, citations: [citation] },
    ],
    llmGateway: {
      providerId: 'fake-llm',
      model: 'fake-model-v1',
      mode: 'complete',
      durationMs: 1,
      timeoutMs: 25000,
      timedOut: false,
      finishReason: 'stop',
    },
    outputGuard: {
      candidate: '答案是7。',
      blocked: true,
      fallback: '我不能替你写答案。先圈出你确定的数，它是几？',
      blockingIssues: ['可能泄露了答案'],
    },
    dataPolicy: 'synthetic only',
  },
}

beforeEach(() => {
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['zh-CN'])
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const body = String(input).includes('rag-eval-report') ? ragReport : behaviorReport
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  localStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('SyntheticDemoPage', () => {
  it('uses the Pages base for report loads and keeps practice inline while supporting a RAG deep link', async () => {
    vi.stubEnv('MODE', 'synthetic-demo')
    vi.stubEnv('BASE_URL', '/thinkbud-ai/')
    window.history.replaceState({}, '', '/thinkbud-ai/#/?rag=degraded')
    render(<SyntheticDemoPage />)
    expect(await screen.findByText('38/38')).toBeInTheDocument()
    expect(screen.getByText('检索故障，不编造依据')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/thinkbud-ai/eval-report.json', '/thinkbud-ai/rag-eval-report.json'])
    expect(screen.getByRole('button', { name: '展开数学练习' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /login|admin/i })).not.toBeInTheDocument()
  })
  it('renders generated guard, citation, gateway, and evidence metadata', async () => {
    render(<SyntheticDemoPage />)

    expect(await screen.findByText('Synthetic Upper Math Notes')).toBeInTheDocument()
    expect(screen.getByText('我不能替你写答案。先圈出你确定的数，它是几？')).toBeInTheDocument()
    expect(screen.getByText('fake-model-v1')).toBeInTheDocument()
    expect(screen.getByText('38/38')).toBeInTheDocument()
    expect(screen.getByText('14/14')).toBeInTheDocument()
    expect(screen.getAllByText(/sourceDirty=false/)).toHaveLength(2)
  })

  it('shows degraded and no-result behavior without inventing citations', async () => {
    const user = userEvent.setup()
    render(<SyntheticDemoPage />)
    await screen.findByText('Synthetic Upper Math Notes')

    await user.click(screen.getByText('展开检索示例'))
    await user.click(screen.getByRole('button', { name: /检索服务故障/ }))
    expect(screen.getByText('检索故障，不编造依据')).toBeInTheDocument()
    expect(screen.getByText(/service missing/)).toBeInTheDocument()
    expect(screen.queryByText('合成引用 TB1')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /未找到结果/ }))
    expect(screen.getByText('没有合适的参考内容')).toBeInTheDocument()
    expect(screen.getByText(/no matching chunks/)).toBeInTheDocument()
  })
  it('keeps practice available when a static report is malformed and recovers on retry', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementation(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    render(<SyntheticDemoPage />)
    await user.click(screen.getByText('查看实现与证据'))
    expect(await screen.findByRole('alert')).toHaveTextContent('报告格式不完整')
    expect(screen.getByRole('button', { name: '展开数学练习' })).toBeInTheDocument()
    expect(screen.queryByText('已拦截')).not.toBeInTheDocument()
    expect(screen.getByText('报告不可用，未作通过判断')).toBeInTheDocument()
    vi.mocked(fetch).mockImplementation(async input => new Response(JSON.stringify(String(input).includes('rag-eval-report') ? ragReport : behaviorReport), { headers: { 'Content-Type': 'application/json' } }))
    await user.click(screen.getByRole('button', { name: '重新加载报告' }))
    expect(await screen.findByText('38/38')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps first-time reading linear and preserves context around an inline exercise', async () => {
    const user = userEvent.setup()
    const { container } = render(<SyntheticDemoPage />)
    await screen.findByText('38/38')
    expect(container.querySelectorAll('.tb-nav a, .tb-hero a, a[href*="#/"]')).toHaveLength(0)
    expect(screen.queryByRole('navigation', { name: '模块导航' })).not.toBeInTheDocument()
    const subjects = screen.getByRole('group', { name: '选择学科' })
    await user.click(within(subjects).getByRole('button', { name: '英语' }))
    await user.click(screen.getByRole('button', { name: '我尝试了一步' }))
    const originalUrl = window.location.href
    await user.click(screen.getByRole('button', { name: '展开数学练习' }))
    const exercise = screen.getByRole('region', { name: '本节数学练习' })
    expect(within(exercise).queryByRole('main')).not.toBeInTheDocument()
    expect(within(exercise).queryByRole('navigation')).not.toBeInTheDocument()
    await user.click(within(exercise).getByRole('checkbox', { name: '我以成人身份体验预设题目的流程' }))
    await user.click(within(exercise).getByRole('button', { name: '开始引导练习' }))
    await user.type(within(exercise).getByRole('textbox', { name: '本步答案' }), '5')
    await user.click(screen.getByRole('button', { name: '收起练习' }))
    expect(screen.queryByRole('region', { name: '本节数学练习' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '继续刚才的练习' })).toHaveFocus())
    await user.click(screen.getByRole('button', { name: '继续刚才的练习' }))
    expect(within(exercise).getByRole('textbox', { name: '本步答案' })).toHaveValue('5')
    expect(within(subjects).getByRole('button', { name: '英语' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '我尝试了一步' })).toHaveAttribute('aria-pressed', 'true')
    expect(window.location.href).toBe(originalUrl)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })

  it('rejects HTML fallbacks and unknown inherited RAG status names without a white screen', async () => {
    window.history.replaceState({}, '', '/#/?rag=toString')
    vi.mocked(fetch).mockResolvedValue(new Response('<html>fallback</html>', { headers: { 'Content-Type': 'text/html' } }))
    render(<SyntheticDemoPage />)
    await userEvent.setup().click(screen.getByText('查看实现与证据'))
    expect(await screen.findByRole('alert')).toHaveTextContent('报告暂时无法读取')
    expect(screen.getByRole('heading', { name: '附上可追溯的参考片段' })).toBeInTheDocument()
  })

})
