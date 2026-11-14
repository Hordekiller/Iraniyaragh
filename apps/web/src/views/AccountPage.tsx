import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, DoorOpen, MapPin, Package, Shield, UserRound } from 'lucide-react'
import type { CustomerAccount } from '@iranyaragh/contracts'
import { useAuth } from '../state/auth-context'
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
        <button type="button" onClick={() => { void controller.open() }} className="mt-6 h-11 rounded-full bg-slate-950 px-6 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2">
          ورود / ثبت‌نام
        </button>
      </div>
    )
  }
  return <ProfileEditor key={state.principal?.userId} />
}

function ProfileEditor() {
  const { controller, request } = useAuth()
  const editor = useCustomerAccountEditor(request, profileDraft, persistProfile, 'customer-profile', 'اطلاعات حساب دریافت نشد. اتصال را بررسی و دوباره تلاش کنید.')
  const { account, draft, loading, saving, error, conflict, message } = editor
  const locked = saving || loading || editor.uncertain
  const dirty = Boolean(account && draft && (draft.firstName !== (account.firstName ?? '') || draft.lastName !== (account.lastName ?? '')))
  const customerName = [account?.firstName, account?.lastName].filter(Boolean).join(' ')

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-7 lg:px-6 lg:py-10">
      <header className="relative overflow-hidden rounded-[28px] bg-slate-950 p-6 text-white sm:p-8">
        <div className="absolute -left-12 -top-20 h-56 w-56 rounded-full bg-orange-500/10" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs font-bold text-orange-300">حساب کاربری ایرانی یراق</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">{customerName ? `سلام، ${customerName}` : 'پیشخوان حساب شما'}</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">سفارش‌ها، نشانی‌ها و اطلاعات حساب را از همین صفحه مدیریت کنید.</p>
          </div>
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-orange-300" aria-hidden="true"><UserRound size={30} /></span>
        </div>
        <div className="relative mt-6 flex flex-wrap gap-3">
          <Link to={ROUTES.orders} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            پیگیری سفارش‌ها <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          <Link to={ROUTES.myCustomDoors} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/25 px-4 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            سفارش‌های ساخت درب <ArrowLeft size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <AccountNavigation />
      <AccountEditorFeedback loading={loading} error={error} conflict={conflict} message={message && 'اطلاعات پروفایل ذخیره شد.'} hasDraft={editor.draft !== null} onRefresh={editor.refresh} />

      {account && draft && <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="profile-heading">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-700"><UserRound aria-hidden="true" /></div>
            <div><h2 id="profile-heading" className="text-lg font-black text-slate-950">اطلاعات شخصی</h2><p className="mt-1 text-xs leading-6 text-slate-600">نام شما در سفارش‌ها و فاکتورها استفاده می‌شود.</p></div>
          </div>
          <form className="mt-6" onSubmit={(event) => { event.preventDefault(); void editor.save() }}>
            <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold text-slate-700" htmlFor="account-first-name">نام
                <input id="account-first-name" autoComplete="given-name" maxLength={100} value={draft.firstName} onChange={(event) => editor.change({ ...draft, firstName: event.target.value })} className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100" />
              </label>
              <label className="block text-sm font-bold text-slate-700" htmlFor="account-last-name">نام خانوادگی
                <input id="account-last-name" autoComplete="family-name" maxLength={100} value={draft.lastName} onChange={(event) => editor.change({ ...draft, lastName: event.target.value })} className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100" />
              </label>
              <label className="block text-sm font-bold text-slate-700 sm:col-span-2" htmlFor="account-mobile">شماره موبایل تأییدشده
                <input id="account-mobile" dir="ltr" value={account.mobile} readOnly aria-describedby="account-mobile-hint" className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-right font-normal text-slate-600" />
              </label>
            </fieldset>
            <p id="account-mobile-hint" className="mt-2 text-xs text-slate-500">این شماره برای ورود به حساب استفاده می‌شود و از اینجا قابل ویرایش نیست.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
              <button type="submit" disabled={saving || loading || conflict || (!dirty && !editor.uncertain)} className="min-h-12 rounded-xl bg-slate-950 px-6 font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'در حال ذخیره…' : editor.uncertain ? 'بررسی دوباره ذخیره' : 'ذخیره پروفایل'}</button>
              {dirty && !locked && <button type="button" onClick={() => editor.change(profileDraft(account))} className="min-h-12 rounded-xl px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600">لغو تغییرها</button>}
              {dirty && !editor.uncertain && <span className="text-xs text-amber-800" role="status">تغییرهای شما هنوز ذخیره نشده‌اند.</span>}
            </div>
          </form>
        </section>

        <aside className="grid gap-3" aria-label="دسترسی‌های سریع حساب">
          <h2 className="text-base font-black text-slate-950">دسترسی سریع</h2>
          <AccountLink to={ROUTES.orders} icon={<Package aria-hidden="true" />} title="مشاهده سفارش‌ها" description="وضعیت سفارش، پرداخت و ارسال" />
          <AccountLink to={ROUTES.myCustomDoors} icon={<DoorOpen aria-hidden="true" />} title="سفارش‌های ساخت درب" description="قیمت نهایی و مراحل تولید" />
          <AccountLink to={ROUTES.addresses} icon={<MapPin aria-hidden="true" />} title="مدیریت نشانی‌ها" description={`${toPersianDigits(account.addresses.length)} نشانی ذخیره‌شده`} />
          <AccountLink to={ROUTES.sessions} icon={<Shield aria-hidden="true" />} title="مدیریت نشست‌ها" description="بررسی و بستن نشست‌های فعال" />
          <button type="button" onClick={() => { void controller.logout() }} className="mt-2 min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 transition hover:border-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600">خروج از حساب</button>
        </aside>
      </div>}
    </div>
  )
}

function AccountLink({ to, icon, title, description }: { to: string; icon: ReactNode; title: string; description: string }) {
  return <Link to={to} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-orange-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-orange-400">{icon}</span>
    <span className="min-w-0 flex-1"><span className="block font-black text-slate-950">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{description}</span></span>
    <ArrowLeft size={16} className="text-slate-400 transition group-hover:-translate-x-1 group-hover:text-orange-700" aria-hidden="true" />
  </Link>
}
