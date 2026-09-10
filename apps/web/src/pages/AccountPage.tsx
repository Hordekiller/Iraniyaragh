import { Link } from 'react-router-dom'
import { Package, UserRound } from 'lucide-react'
import { useAuth } from '../state/auth-context'
import { useToast } from '../components/feedback/toast-context'
import { ROUTES } from '../lib/routes'
import { toPersianDigits } from '../lib/format'

export function AccountPage() {
  const { state, controller } = useAuth()
  const { show } = useToast()

  const authenticated = state.phase === 'authenticated' && Boolean(state.principal)

  if (!authenticated) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <UserRound size={28} aria-hidden="true" />
        </div>
        <h1 className="mt-4 font-black text-slate-900 text-xl">وارد حساب کاربری شوید</h1>
        <p className="mt-2 text-slate-500 text-sm">برای مشاهده حساب و سفارش‌های خود وارد شوید.</p>
        <button
          type="button"
          onClick={() => { void controller.open() }}
          className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          ورود / ثبت‌نام
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <h1 className="font-black text-slate-900 text-lg lg:text-xl">حساب کاربری</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[24px] border border-slate-100 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FF4D00]/10 text-[#C2410C] flex items-center justify-center">
              <UserRound size={26} aria-hidden="true" />
            </div>
            <div>
              <div className="font-black text-slate-900">کاربر ایران یراق</div>
              <div dir="ltr" className="text-xs text-slate-400 mt-0.5">{toPersianDigits(state.principal!.userId)}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void controller.logout(); show('از حساب خارج شدید') }}
            className="mt-5 w-full h-11 rounded-full border-2 border-slate-900 text-slate-900 font-black hover:bg-slate-900 hover:text-white transition"
          >
            خروج از حساب
          </button>
        </div>

        <Link
          to={ROUTES.orders}
          className="rounded-[24px] border border-slate-100 bg-white p-6 hover:border-slate-200 hover:shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
              <Package size={26} aria-hidden="true" />
            </div>
            <div>
              <div className="font-black text-slate-900">سفارش‌های من</div>
              <div className="text-xs text-slate-400 mt-0.5">مشاهده و پیگیری سفارش‌ها</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
