import { useLayoutEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import SyntheticDemoPage from './pages/SyntheticDemoPage'
import PracticePage from './pages/PracticePage'

// Static entry: no AuthProvider, service pages, camera/microphone or error telemetry.
export default function DemoApp() {
  const { pathname } = useLocation()
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return <ToastProvider><Routes>
    <Route path="/" element={<SyntheticDemoPage />} />
    <Route path="/showcase" element={<SyntheticDemoPage />} />
    <Route path="/practice" element={<PracticePage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></ToastProvider>
}
