import { Link } from 'react-router-dom'
import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import type { CustomerAccount, CustomerAccountAddressesRequest } from '@iranyaragh/contracts'
import { useAuth } from '../state/auth-context'
import { ROUTES } from '../lib/routes'
import { replaceCustomerAddresses } from '../services/customer-account'
import { IRAN_PROVINCES, IRAN_PROVINCE_CODES, normalizeIranMobile, normalizeIranPostalCode } from '../lib/iran'

import type { AuthenticatedJsonRequest } from '../state/auth-context'
import { useCustomerAccountEditor } from '../services/use-customer-account-editor'
import { AccountNavigation, SessionRestoring } from '../components/account/AccountNavigation'
import { AccountEditorFeedback } from '../components/account/AccountEditorFeedback'

type AddressInput = CustomerAccountAddressesRequest['addresses'][number]
const emptyAddress = (): AddressInput => ({ label: '', receiverName: '', mobile: '', provinceCode: '', city: '', addressLine: '', postalCode: '', isDefault: false })

const addressDraft = (account: CustomerAccount): AddressInput[] => account.addresses.map(({ label, receiverName, mobile, provinceCode, city, addressLine, postalCode, isDefault }) => ({ label, receiverName, mobile, provinceCode, city, addressLine, postalCode, isDefault }))
const persistAddresses = (request: AuthenticatedJsonRequest, account: CustomerAccount, addresses: AddressInput[], key: string) => replaceCustomerAddresses(request, {
  expectedVersion: account.version, addresses: addresses.map((address) => ({ ...address, mobile: normalizeIranMobile(address.mobile), postalCode: address.postalCode ? normalizeIranPostalCode(address.postalCode) : null })),
}, key)

export function AccountAddressesPage() {
  const auth = useAuth()
  if (auth.state.phase !== 'authenticated' && (!auth.restored || auth.state.restoring)) return <SessionRestoring />
  if (auth.state.phase !== 'authenticated') return <AccountRequired onOpen={auth.open} />
  return <AddressEditor key={auth.state.principal?.userId} />
}

function AddressEditor() {
  const auth = useAuth()
  const editor = useCustomerAccountEditor(auth.request, addressDraft, persistAddresses, 'customer-addresses', 'دفتر نشانی دریافت نشد. دوباره تلاش کنید.')
  const { account, loading, saving, error, conflict, message } = editor
  const addresses = editor.draft ?? []
  const locked = saving || loading || editor.uncertain

  function changeAddress(index: number, field: keyof AddressInput, value: string | boolean) {
    editor.change(addresses.map((address, i) => i === index ? { ...address, [field]: value } : address))
  }

  function addAddress() {
    if (addresses.length >= 20) return
    editor.change([...addresses, { ...emptyAddress(), isDefault: addresses.length === 0 }])
  }

  function removeAddress(index: number) {
    if (!window.confirm(`نشانی «${addresses[index].label || `شماره ${index + 1}`}» حذف شود؟`)) return
    const remaining = addresses.filter((_, i) => i !== index)
    const defaultIndex = Math.max(0, remaining.findIndex((item) => item.isDefault))
    editor.change(remaining.map((item, i) => ({ ...item, isDefault: i === defaultIndex })))
  }
  return <div className="mx-auto max-w-[900px] px-4 py-8 lg:px-6">
    <Link to={ROUTES.account} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-orange-700"><ArrowRight size={16} aria-hidden="true" /> بازگشت به حساب</Link>
    <h1 className="mt-4 text-2xl font-black text-slate-950">دفتر نشانی‌ها</h1>
    <p className="mt-2 text-sm text-slate-500">نشانی‌های ذخیره‌شده برای سفارش‌های بعدی استفاده می‌شوند. تغییر این فهرست، نشانی سفارش‌های قبلی را تغییر نمی‌دهد.</p>
    <AccountNavigation />
    <AccountEditorFeedback loading={loading} error={error} conflict={conflict} message={message && 'نشانی‌ها ذخیره شدند.'} hasDraft={editor.draft !== null} onRefresh={editor.refresh} />
    {account && <form onSubmit={(event) => { event.preventDefault(); void editor.save() }} className="mt-6 space-y-5">
      {addresses.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">هنوز نشانی ذخیره نکرده‌اید. برای خرید بعدی، نشانی تحویل را اضافه کنید.</p>}
      {addresses.map((address, index) => <fieldset disabled={locked} key={index} className="rounded-2xl border border-slate-200 bg-white p-5">
        <legend className="px-2 font-black text-slate-900">نشانی {index + 1}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <AddressField label="عنوان نشانی" value={address.label} onChange={(value) => changeAddress(index, 'label', value)} maxLength={60} />
          <AddressField label="نام تحویل‌گیرنده" value={address.receiverName} onChange={(value) => changeAddress(index, 'receiverName', value)} maxLength={120} />
          <AddressField label="موبایل تحویل‌گیرنده" value={address.mobile} onChange={(value) => changeAddress(index, 'mobile', value)} maxLength={20} dir="ltr" />
          <label className="block text-sm font-bold text-slate-700">استان<select required value={IRAN_PROVINCES.find((province) => IRAN_PROVINCE_CODES[province] === address.provinceCode) ?? ''} onChange={(event) => { const province = event.target.value as (typeof IRAN_PROVINCES)[number]; changeAddress(index, 'provinceCode', IRAN_PROVINCE_CODES[province] ?? '') }} className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-100"><option value="">انتخاب استان</option>{IRAN_PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}</select></label>
          <AddressField label="شهر" value={address.city} onChange={(value) => changeAddress(index, 'city', value)} maxLength={100} />
          <AddressField label="کد پستی" value={address.postalCode ?? ''} onChange={(value) => changeAddress(index, 'postalCode', value)} maxLength={20} required={false} />
          <label className="sm:col-span-2 block text-sm font-bold text-slate-700">نشانی کامل
            <textarea required maxLength={400} rows={3} value={address.addressLine} onChange={(event) => changeAddress(index, 'addressLine', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-100" />
          </label>
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-bold"><input type="radio" name="default-address" checked={address.isDefault} onChange={() => editor.change(addresses.map((item, i) => ({ ...item, isDefault: i === index })))} /> نشانی پیش‌فرض</label>
            <button type="button" onClick={() => removeAddress(index)} className="inline-flex items-center gap-2 text-sm font-bold text-red-700"><Trash2 size={16} aria-hidden="true" /> حذف نشانی</button>
          </div>
        </div>
      </fieldset>)}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={locked || addresses.length >= 20} onClick={addAddress} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 font-bold disabled:opacity-50"><Plus size={16} aria-hidden="true" /> افزودن نشانی</button>
        <button type="submit" disabled={saving || loading || conflict} className="h-11 rounded-xl bg-slate-950 px-5 font-bold text-white disabled:opacity-60">{saving ? 'در حال ذخیره…' : 'ذخیره نشانی‌ها'}</button>
      </div>
    </form>}
  </div>
}

function AddressField({ label, value, onChange, maxLength, dir, required = true }: { label: string; value: string; onChange: (value: string) => void; maxLength: number; dir?: 'ltr'; required?: boolean }) {
  return <label className="block text-sm font-bold text-slate-700">{label}<input required={required} maxLength={maxLength} dir={dir} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 font-normal focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-100" /></label>
}

function AccountRequired({ onOpen }: { onOpen: () => void }) {
  return <div className="mx-auto max-w-[720px] px-4 py-20 text-center"><h1 className="text-xl font-black">برای مدیریت نشانی‌ها وارد شوید</h1><button type="button" onClick={onOpen} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white">ورود / ثبت‌نام</button></div>
}
