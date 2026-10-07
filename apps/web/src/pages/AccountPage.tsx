import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Package, Shield, UserRound } from 'lucide-react'
import type { CustomerAccount } from '@iranyaragh/contracts'
import { useAuth } from '../state/auth-context'
import { useToast } from '../components/feedback/toast-context'
import { ROUTES } from '../lib/routes'
import { toPersianDigits } from '../lib/format'
import { updateCustomerAccount } from '../services/customer-account'
import type { AuthenticatedJsonRequest } from '../state/auth-context'
import { useCustomerAccountEditor } from '../services/use-customer-account-editor'
import { AccountNavigation, SessionRestoring } from '../components/account/AccountNavigation'
import { AccountEditorFeedback } from '../components/account/AccountEditorFeedback'

type ProfileDraft = { firstName: string; lastName: string }
const profileDraft = (account: CustomerAccount): ProfileDraft => ({ firstName: account.firstName ?? '', lastName: account.lastName ?? '' })
const persistProfile = (request: AuthenticatedJsonRequest, account: CustomerAccount, draft: ProfileDraft, key: string) => updateCustomerAccount(request, {
  expectedVersion: account.version, firstName: draft.firstName.trim() || null, lastName: draft.lastName.trim() || null,
}, key)

export function AccountPage() {
  const { state, controller, restored } = useAuth()
  const authenticated = state.phase === 'authenticated' && Boolean(state.principal)
  if (state.phase !== 'authenticated' && (!restored || state.restoring)) return <SessionRestoring />
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

  return <ProfileEditor key={state.principal?.userId} />
}

function ProfileEditor() {
  const { controller, request } = useAuth()
  const { show } = useToast()
  const editor = useCustomerAccountEditor(request, profileDraft, persistProfile, 'customer-profile', 'اطلاعات حساب دریافت نشد. اتصال را بررسی و دوباره تلاش کنید.')
  const { account, draft, loading, saving, error, conflict, message } = editor
  const locked = saving || loading || editor.uncertain
  return (
    <div className="mx-auto max-w-[1040px] px-4 py-8 lg:px-6">
      <header>
        <p className="text-xs font-bold text-orange-700">حساب کاربری</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">پیشخوان حساب شما</h1>
        <p className="mt-2 text-sm text-slate-500">پروفایل، نشانی‌ها و سفارش‌های خود را از اینجا مدیریت کنید.</p>
      </header>

      <AccountNavigation />
      <AccountEditorFeedback loading={loading} error={error} conflict={conflict} message={message && 'اطلاعات پروفایل ذخیره شد.'} hasDraft={editor.draft !== null} onRefresh={editor.refresh} />

      {account && draft && <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7" aria-labelledby="profile-heading">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-700"><UserRound aria-hidden="true" /></div>
            <div><h2 id="profile-heading" className="font-black text-slate-950">اطلاعات پروفایل</h2><p className="mt-1 text-xs text-slate-500">شماره موبایل تأییدشده قابل ویرایش نیست.</p></div>
          </div>
          <form className="mt-6" onSubmit={(event) => { event.preventDefault(); void editor.save() }}>
            <fieldset disabled={locked} className="space-y-4">
            <label className="block text-sm font-bold text-slate-700" htmlFor="account-first-name">نام
              <input id="account-first-name" autoComplete="given-name" maxLength={100} value={draft.firstName} onChange={(event) => editor.change({ ...draft, firstName: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100" />
            </label>
            <label className="block text-sm font-bold text-slate-700" htmlFor="account-last-name">نام خانوادگی
              <input id="account-last-name" autoComplete="family-name" maxLength={100} value={draft.lastName} onChange={(event) => editor.change({ ...draft, lastName: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100" />
            </label>
            <label className="block text-sm font-bold text-slate-700" htmlFor="account-mobile">شماره موبایل
              <input id="account-mobile" dir="ltr" value={account.mobile} readOnly className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-right font-normal text-slate-500" />
            </label>
            </fieldset>
            <button type="submit" disabled={saving || loading || conflict} className="h-11 rounded-xl bg-slate-950 px-5 font-bold text-white disabled:cursor-wait disabled:opacity-60">{saving ? 'در حال ذخیره…' : 'ذخیره پروفایل'}</button>
          </form>
        </section>

        <div className="grid content-start gap-3">
          <AccountLink to={ROUTES.orders} icon={<Package aria-hidden="true" />} title="مشاهده سفارش‌ها" description="مشاهده وضعیت سفارش، پرداخت و ارسال" />
          <AccountLink to={ROUTES.addresses} icon={<MapPin aria-hidden="true" />} title="مدیریت نشانی‌ها" description={`${toPersianDigits(account.addresses.length)} نشانی ذخیره‌شده`} />
          <AccountLink to={ROUTES.sessions} icon={<Shield aria-hidden="true" />} title="مدیریت نشست‌ها" description="بررسی و بستن نشست‌های فعال" />
          <button type="button" onClick={() => { void controller.logout().then(() => show('از حساب خارج شدید')) }} className="mt-2 h-11 rounded-xl border-2 border-slate-900 font-black text-slate-900 transition hover:bg-slate-900 hover:text-white">خروج از حساب</button>
        </div>
      </div>}
    </div>
  )
}

function AccountLink({ to, icon, title, description }: { to: string; icon: ReactNode; title: string; description: string }) {
  return <Link to={to} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-orange-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-orange-400">{icon}</span>
    <span><span className="block font-black text-slate-950">{title}</span><span className="mt-1 block text-xs text-slate-500">{description}</span></span>
  </Link>
}
