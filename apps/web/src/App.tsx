import { ToastProvider } from './components/feedback/Toast'
import { HomePage } from './pages/HomePage'

export default function App() {
  return (
    <div
      className="min-h-screen bg-[#0a0f1e] text-slate-800"
      style={{ fontFamily: 'Vazirmatn, system-ui, sans-serif' }}
      dir="rtl"
    >
      <ToastProvider>
        <HomePage />
      </ToastProvider>
      <style>{`
        .scrollbar-none::-webkit-scrollbar{display:none}
        .scrollbar-none{scrollbar-width:none;-ms-overflow-style:none}
      `}</style>
    </div>
  )
}