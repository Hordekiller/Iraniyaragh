import { useCallback, useState } from 'react'
import { ToastProvider } from './components/feedback/Toast'
import { AuthProvider } from './state/AuthProvider'
import { LoginDialog } from './components/auth/LoginDialog'
import { HomePage } from './pages/HomePage'

export default function App() {
  const [loginOpen, setLoginOpen] = useState(false)
  const openLogin = useCallback(() => setLoginOpen(true), [])
  const closeLogin = useCallback(() => setLoginOpen(false), [])

  return (
    <div
      className="min-h-screen bg-[#0a0f1e] text-slate-800"
      style={{ fontFamily: 'Vazirmatn, system-ui, sans-serif' }}
      dir="rtl"
    >
      <ToastProvider>
        <AuthProvider>
          <HomePage onOpenLogin={openLogin} />
          <LoginDialog open={loginOpen} onClose={closeLogin} />
        </AuthProvider>
      </ToastProvider>
      <style>{`
        .scrollbar-none::-webkit-scrollbar{display:none}
        .scrollbar-none{scrollbar-width:none;-ms-overflow-style:none}
      `}</style>
    </div>
  )
}
