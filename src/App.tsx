import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import BudMascot from './components/BudMascot'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const WelcomePage = lazy(() => import('./pages/WelcomePage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const ThinkingTreePage = lazy(() => import('./pages/ThinkingTreePage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const ConversationPage = lazy(() => import('./pages/ConversationPage'))
const WeeklySummaryPage = lazy(() => import('./pages/WeeklySummaryPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const ParentPage = lazy(() => import('./pages/ParentPage'))
const ProgressPage = lazy(() => import('./pages/ProgressPage'))
const WhiteboardSpikePage = lazy(() => import('./pages/WhiteboardSpikePage'))

function LoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4" role="status" aria-label="加载中">
      <div className="w-20 h-24" aria-hidden="true">
        <BudMascot animate="idle" />
      </div>
      <p className="text-sm text-gray-400 animate-pulse">加载中...</p>
    </div>
  )
}

/** 已登录才能访问的路由 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4" role="status" aria-label="加载中">
        <div className="w-20 h-24" aria-hidden="true">
          <BudMascot animate="idle" />
        </div>
        <p className="text-sm text-gray-400 animate-pulse">正在验证登录状态...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <AuthProvider>
          <div className="h-full bg-[var(--color-bg-primary)]">
            <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* 公开路由 */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/admin" element={<AdminPage />} />

              {/* 受保护路由 */}
              <Route path="/" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
              <Route path="/welcome" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
              <Route path="/tree" element={<ProtectedRoute><ThinkingTreePage /></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
              <Route path="/conversation" element={<ProtectedRoute><ConversationPage /></ProtectedRoute>} />
              <Route path="/weekly" element={<ProtectedRoute><WeeklySummaryPage /></ProtectedRoute>} />
              <Route path="/parent" element={<ProtectedRoute><ParentPage /></ProtectedRoute>} />
              <Route path="/progress" element={<ProtectedRoute><ProgressPage /></ProtectedRoute>} />

              {/* Spike 页面 */}
              <Route path="/spike/whiteboard" element={<ProtectedRoute><WhiteboardSpikePage /></ProtectedRoute>} />

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </Suspense>
          </div>
        </AuthProvider>
      </ErrorBoundary>
    </ToastProvider>
  )
}
