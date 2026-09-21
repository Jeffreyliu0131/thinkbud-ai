import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import './index.css'
if (import.meta.env.MODE === 'synthetic-demo') {
  // Vite removes the service branch from this static build entirely.
  void import('./DemoApp').then(({ default: DemoApp }) => {
    createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><DemoApp /></HashRouter></StrictMode>)
  })
} else {
  void Promise.all([import('./App'), import('./lib/errorReporter')]).then(([{ default: App }, { installGlobalErrorHandler }]) => {
    installGlobalErrorHandler()
    createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>)
  })
}
