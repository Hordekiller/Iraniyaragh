import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import type { CustomerAccount, CustomerAccountAddressesRequest } from '@iranyaragh/contracts'
import { useAuth } from '../state/auth-context'
import { ROUTES } from '../lib/routes'
import { getCustomerAccount, replaceCustomerAddresses } from '../services/customer-account'
import { IRAN_PROVINCES, IRAN_PROVINCE_CODES } from '../lib/iran'

type AddressInput = CustomerAccountAddressesRequest['addresses'][number]
const emptyAddress = (): AddressInput => ({ label: '', receiverName: '', mobile: '', provinceCode: '', city: '', addressLine: '', postalCode: '', isDefault: false })

export function AccountAddressesPage() {
  const auth = useAuth()
  const [account, setAccount] = useState<CustomerAccount | null>(null)
  const [addresses, setAddresses] = useState<AddressInput[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retryKey = useRef<string | null>(null)
  const authenticated = auth.state.phase === 'authenticated'

  useEffect(() => {
    let active = true
    if (!authenticated) return
    void Promise.resolve().then(async () => {
      try {
        const result = await getCustomerAccount(auth.request)
        if (!active) return
        setAccount(result)
        setAddresses(result.addresses.map(({ label, receiverName, mobile, provinceCode, city, addressLine, postalCode, isDefault }) => ({ label, receiverName, mobile, provinceCode, city, addressLine, postalCode, isDefault })))
      } catch { if (active) setError('دفتر نشانی دریافت نشد. دوباره تلاش کنید.') }
      finally { if (active) setLoading(false) }
    })
    return () => { active = false }
  }, [authenticated, auth.request])

  function changeAddress(index: number, field: keyof AddressInput, value: string | boolean) {
    retryKey.current = null
    setAddresses((current) => current.map((address, i) => i === index ? { ...address, [field]: value } : address))
  }

  function addAddress() {
    if (addresses.length >= 20) return
    retryKey.current = null
    setAddresses((current) => [...current, { ...emptyAddress(), isDefault: current.length === 0 }])
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account) return
    setSaving(true)
    setError(null)
    try {
      const updated = await replaceCustomerAddresses(auth.request, { expectedVersion: account.version, addresses }, retryKey.current ??= `customer-addresses-${crypto.randomUUID()}`)
      retryKey.current = null
      setAccount(updated)
      setAddresses(updated.addresses.map(({ label, receiverName, mobile, provinceCode, city, addressLine, postalCode, isDefault }) => ({ label, receiverName, mobile, provinceCode, city, addressLine, postalCode, isDefault })))
    } catch {
      setError('نشانی‌ها ذخیره نشدند. تغییرها حفظ شده‌اند؛ بررسی کنید فقط یک نشانی پیش‌فرض داشته باشید و دوباره تلاش کنید.')
    } finally { setSaving(false) }
  }

  if (!authenticated) return <AccountRequired onOpen={auth.open} />
  return <main className="mx-auto max-w-[900px] px-4 py-8 lg:px-6">
    <Link to={ROUTES.account} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-orange-700"><ArrowRight size={16} aria-hidden="true" /> بازگشت به حساب</Link>
    <h1 className="mt-4 text-2xl font-black text-slate-950">دفتر نشانی‌ها</h1>
    <p className="mt-2 text-sm text-slate-500">نشانی‌های ذخیره‌شده برای سفارش‌های بعدی استفاده می‌شوند. تغییر این فهرست، نشانی سفارش‌های قبلی را تغییر نمی‌دهد.</p>
    {loading && <p className="mt-6" role="status">در حال دریافت نشانی‌ها…</p>}
    {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}
    {!loading && account && <form onSubmit={(event) => { void save(event) }} className="mt-6 space-y-5">
      {addresses.map((address, index) => <fieldset key={index} className="rounded-2xl border border-slate-200 bg-white p-5">
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
            <label className="inline-flex items-center gap-2 text-sm font-bold"><input type="radio" name="default-address" checked={address.isDefault} onChange={() => { retryKey.current = null; setAddresses((items) => items.map((item, i) => ({ ...item, isDefault: i === index }))) }} /> نشانی پیش‌فرض</label>
            <button type="button" onClick={() => { if (!window.confirm(`نشانی «${address.label || `شماره ${index + 1}`}» حذف شود؟`)) return; retryKey.current = null; setAddresses((items) => items.filter((_, i) => i !== index).map((item, i) => ({ ...item, isDefault: item.isDefault || i === 0 }))) }} className="inline-flex items-center gap-2 text-sm font-bold text-red-700"><Trash2 size={16} aria-hidden="true" /> حذف نشانی</button>
          </div>
        </div>
      </fieldset>)}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={addresses.length >= 20} onClick={addAddress} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 font-bold disabled:opacity-50"><Plus size={16} aria-hidden="true" /> افزودن نشانی</button>
        <button type="submit" disabled={saving || loading} className="h-11 rounded-xl bg-slate-950 px-5 font-bold text-white disabled:opacity-60">{saving ? 'در حال ذخیره…' : 'ذخیره نشانی‌ها'}</button>
      </div>
    </form>}
  </main>
}

function AddressField({ label, value, onChange, maxLength, dir, required = true }: { label: string; value: string; onChange: (value: string) => void; maxLength: number; dir?: 'ltr'; required?: boolean }) {
  return <label className="block text-sm font-bold text-slate-700">{label}<input required={required} maxLength={maxLength} dir={dir} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 font-normal focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-100" /></label>
}

function AccountRequired({ onOpen }: { onOpen: () => void }) {
  return <main className="mx-auto max-w-[720px] px-4 py-20 text-center"><h1 className="text-xl font-black">برای مدیریت نشانی‌ها وارد شوید</h1><button type="button" onClick={onOpen} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white">ورود / ثبت‌نام</button></main>
}
