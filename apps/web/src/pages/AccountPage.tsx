import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Package, RefreshCw, Shield, UserRound } from 'lucide-react'
import type { CustomerAccount } from '@iranyaragh/contracts'
import { useAuth } from '../state/auth-context'
import { useToast } from '../components/feedback/toast-context'
import { ROUTES } from '../lib/routes'
import { toPersianDigits } from '../lib/format'
import { getCustomerAccount, updateCustomerAccount } from '../services/customer-account'

export function AccountPage() {
  const { state, controller, request } = useAuth()
  const { show } = useToast()
  const authenticated = state.phase === 'authenticated' && Boolean(state.principal)
  const [account, setAccount] = useState<CustomerAccount | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const profileRetryKey = useRef<string | null>(null)

  useEffect(() => {
    if (!authenticated) return
    let active = true
    void Promise.resolve().then(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await getCustomerAccount(request)
        if (!active) return
        setAccount(result)
        setFirstName(result.firstName ?? '')
        setLastName(result.lastName ?? '')
      } catch {
        if (active) setError('اطلاعات حساب دریافت نشد. اتصال را بررسی و دوباره تلاش کنید.')
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => { active = false }
  }, [authenticated, request, reload])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updateCustomerAccount(request, {
        expectedVersion: account.version,
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
      }, profileRetryKey.current ??= `customer-profile-${crypto.randomUUID()}`)
      profileRetryKey.current = null
      setAccount(updated)
      setFirstName(updated.firstName ?? '')
      setLastName(updated.lastName ?? '')
      show('اطلاعات پروفایل ذخیره شد.')
    } catch {
      setError('ذخیره اطلاعات انجام نشد. تغییرها حفظ شده‌اند؛ دوباره تلاش کنید یا صفحه را تازه‌سازی کنید.')
    } finally {
      setSaving(false)
    }
  }

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-20 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <UserRound size={28} aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-black text-slate-900">وارد حساب کاربری شوید</h1>
        <p className="mt-2 text-sm text-slate-500">برای مشاهده پروفایل و سفارش‌ها وارد حساب خود شوید.</p>
        <button type="button" onClick={() => { void controller.open() }} className="mt-6 h-11 rounded-full bg-[#0F172A] px-6 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2">
          ورود / ثبت‌نام
        </button>
      </div>
    )
  }

  return (
    <main className="mx-auto max-w-[1040px] px-4 py-8 lg:px-6">
      <header>
        <p className="text-xs font-bold text-orange-700">حساب کاربری</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">پیشخوان حساب شما</h1>
        <p className="mt-2 text-sm text-slate-500">پروفایل، نشانی‌ها و سفارش‌های خود را از اینجا مدیریت کنید.</p>
      </header>

      {loading && <p className="mt-6 rounded-xl bg-white p-5 text-sm text-slate-500" role="status">در حال دریافت اطلاعات حساب…</p>}
      {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => setReload((value) => value + 1)} className="mt-3 inline-flex items-center gap-2 font-bold underline"><RefreshCw size={15} aria-hidden="true" /> تلاش دوباره</button>
      </div>}

      {account && <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7" aria-labelledby="profile-heading">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-700"><UserRound aria-hidden="true" /></div>
            <div><h2 id="profile-heading" className="font-black text-slate-950">اطلاعات پروفایل</h2><p className="mt-1 text-xs text-slate-500">شماره موبایل تأییدشده قابل ویرایش نیست.</p></div>
          </div>
          <form className="mt-6 space-y-4" onSubmit={(event) => { void saveProfile(event) }}>
            <label className="block text-sm font-bold text-slate-700" htmlFor="account-first-name">نام
              <input id="account-first-name" autoComplete="given-name" maxLength={100} value={firstName} onChange={(event) => { profileRetryKey.current = null; setFirstName(event.target.value) }} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100" />
            </label>
            <label className="block text-sm font-bold text-slate-700" htmlFor="account-last-name">نام خانوادگی
              <input id="account-last-name" autoComplete="family-name" maxLength={100} value={lastName} onChange={(event) => { profileRetryKey.current = null; setLastName(event.target.value) }} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100" />
            </label>
            <label className="block text-sm font-bold text-slate-700" htmlFor="account-mobile">شماره موبایل
              <input id="account-mobile" dir="ltr" value={account.mobile} readOnly className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-right font-normal text-slate-500" />
            </label>
            <button type="submit" disabled={saving} className="h-11 rounded-xl bg-slate-950 px-5 font-bold text-white disabled:cursor-wait disabled:opacity-60">{saving ? 'در حال ذخیره…' : 'ذخیره پروفایل'}</button>
          </form>
        </section>

        <nav className="grid content-start gap-3" aria-label="بخش‌های حساب کاربری">
          <AccountLink to={ROUTES.orders} icon={<Package aria-hidden="true" />} title="سفارش‌های من" description="مشاهده وضعیت سفارش، پرداخت و ارسال" />
          <AccountLink to={ROUTES.addresses} icon={<MapPin aria-hidden="true" />} title="دفتر نشانی‌ها" description={`${toPersianDigits(account.addresses.length)} نشانی ذخیره‌شده`} />
          <AccountLink to={ROUTES.sessions} icon={<Shield aria-hidden="true" />} title="امنیت و نشست‌ها" description="بررسی و بستن نشست‌های فعال" />
          <button type="button" onClick={() => { void controller.logout().then(() => show('از حساب خارج شدید')) }} className="mt-2 h-11 rounded-xl border-2 border-slate-900 font-black text-slate-900 transition hover:bg-slate-900 hover:text-white">خروج از حساب</button>
        </nav>
      </div>}
    </main>
  )
}

function AccountLink({ to, icon, title, description }: { to: string; icon: ReactNode; title: string; description: string }) {
  return <Link to={to} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-orange-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-orange-400">{icon}</span>
    <span><span className="block font-black text-slate-950">{title}</span><span className="mt-1 block text-xs text-slate-500">{description}</span></span>
  </Link>
}
