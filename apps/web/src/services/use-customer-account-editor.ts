import { useEffect, useRef, useState } from 'react'
import type { CustomerAccount } from '@iranyaragh/contracts'
import type { AuthenticatedJsonRequest } from '../state/auth-context'
import { AuthApiError } from '../lib/auth/errors'
import { getCustomerAccount } from './customer-account'

type Persist<T> = (request: AuthenticatedJsonRequest, account: CustomerAccount, draft: T, key: string) => Promise<CustomerAccount>

function mutationFailure(cause: unknown) {
  const code = cause instanceof AuthApiError ? String(cause.code) : ''
  if (code === 'VERSION_CONFLICT' || code === 'STALE_VERSION') return {
    conflict: true, uncertain: false,
    error: 'اطلاعات در نشست دیگری تغییر کرده است. نسخه جدید را دریافت کنید؛ تغییرهای شما حفظ می‌شوند و پیش از ذخیره دوباره قابل بررسی هستند.',
  }
  if (cause instanceof AuthApiError && cause.statusCode && cause.statusCode >= 400 && cause.statusCode < 500 && cause.statusCode !== 409) return {
    conflict: false, uncertain: false,
    error: cause.statusCode === 429 ? 'درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.' : 'ذخیره تأیید نشد. ورودی‌ها و دسترسی نشست را بررسی کنید؛ تغییرهای شما حفظ شده‌اند.',
  }
  return {
    conflict: false, uncertain: true,
    error: 'نتیجه ذخیره مشخص نیست. تغییرهای شما حفظ شده‌اند؛ برای بررسی همان درخواست، دوباره ذخیره کنید یا اطلاعات ذخیره‌شده را بارگذاری کنید.',
  }
}

/** Mounted per authenticated principal. Uncertain mutations replay the same payload/key. */
export function useCustomerAccountEditor<T>(request: AuthenticatedJsonRequest, fromAccount: (account: CustomerAccount) => T, persist: Persist<T>, prefix: string, loadError: string) {
  const [account, setAccount] = useState<CustomerAccount | null>(null)
  const [draft, setDraft] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [uncertain, setUncertain] = useState(false)
  const attempt = useRef<{ account: CustomerAccount; draft: T; key: string } | null>(null)
  const inFlight = useRef(false)
  const preserveDraft = useRef(false)
  const mounted = useRef(false)

  useEffect(() => {
    let active = true
    mounted.current = true
    void getCustomerAccount(request).then((result) => {
      if (!active) return
      setAccount(result)
      if (!preserveDraft.current) setDraft(fromAccount(result))
      preserveDraft.current = false
      attempt.current = null
      setConflict(false)
      setUncertain(false)
      setError(null)
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof AuthApiError && cause.code === 'CUSTOMER_ACCOUNT_LINK_REQUIRED'
        ? 'برای اتصال امن حساب خرید با پشتیبانی تماس بگیرید.' : loadError)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; mounted.current = false }
  }, [request, fromAccount, reload, loadError])

  function change(next: T) {
    if (inFlight.current || loading || uncertain) return
    attempt.current = null
    setDraft(next)
    setMessage(null)
  }

  function refresh(keepChanges = false) {
    if (inFlight.current) return
    if (!keepChanges && draft && !window.confirm('اطلاعات ذخیره‌شده بارگذاری شود؟ تغییرهای ذخیره‌نشده کنار گذاشته می‌شوند.')) return
    preserveDraft.current = keepChanges
    setLoading(true)
    setMessage(null)
    setReload((value) => value + 1)
  }

  async function save() {
    if (!account || !draft || inFlight.current || loading || conflict) return
    inFlight.current = true
    setSaving(true)
    setError(null)
    setMessage(null)
    attempt.current ??= { account, draft, key: `${prefix}-${crypto.randomUUID()}` }
    try {
      const updated = await persist(request, attempt.current.account, attempt.current.draft, attempt.current.key)
      if (!mounted.current) return
      attempt.current = null
      setAccount(updated)
      setDraft(fromAccount(updated))
      setUncertain(false)
      setMessage('اطلاعات با موفقیت ذخیره شد.')
    } catch (cause) {
      if (!mounted.current) return
      const failure = mutationFailure(cause)
      if (!failure.conflict && !failure.uncertain) attempt.current = null
      setConflict(failure.conflict)
      setUncertain(failure.uncertain)
      setError(failure.error)
    } finally {
      inFlight.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return { account, draft, loading, saving, error, conflict, message, uncertain, change, refresh, save }
}
