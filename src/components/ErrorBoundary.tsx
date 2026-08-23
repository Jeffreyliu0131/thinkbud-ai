import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * React Error Boundary — 防止组件崩溃白屏
 * 出错时显示友好界面，可重试
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 捕获到渲染错误:', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="h-full w-full bg-[#FFFBF5] flex items-center justify-center px-6" role="alert">
          <div className="text-center max-w-sm">
            {/* 表情 */}
            <div className="text-6xl mb-4" aria-hidden="true">😵</div>

            <h2 className="text-xl font-bold text-gray-800 mb-2">
              哎呀，出了点小问题
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              别担心，我们马上修好它！
            </p>

            {/* 错误详情（开发时有用） */}
            {import.meta.env.DEV && this.state.error && (
              <pre className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 text-left mb-4 overflow-x-auto">
                {this.state.error.message}
              </pre>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="bg-teal-500 text-white px-6 py-2.5 rounded-2xl text-sm font-semibold active:scale-95 transition-transform shadow-md"
              >
                重试一下
              </button>
              <button
                onClick={this.handleGoHome}
                className="bg-white text-gray-600 px-6 py-2.5 rounded-2xl text-sm font-semibold active:scale-95 transition-transform border border-gray-200 shadow-sm"
              >
                回首页
              </button>
            </div>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
