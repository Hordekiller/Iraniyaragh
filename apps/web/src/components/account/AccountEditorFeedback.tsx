export function AccountEditorFeedback({ loading, error, conflict, message, hasDraft, onRefresh }: {
  loading: boolean; error: string | null; conflict: boolean; message: string | null; hasDraft: boolean; onRefresh: (keepChanges?: boolean) => void
}) {
  return <>
    {loading && <p role="status" className="my-5 text-sm text-slate-600">در حال دریافت اطلاعات حساب…</p>}
    {error && <div role="alert" className="my-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-800">
      <p>{error}</p><button type="button" disabled={loading} onClick={() => onRefresh(conflict)} className="mt-2 font-bold underline disabled:opacity-50">{conflict ? 'دریافت نسخه جدید با حفظ تغییرها' : hasDraft ? 'بارگذاری اطلاعات ذخیره‌شده' : 'تلاش دوباره'}</button>
    </div>}
    {message && <p role="status" className="my-5 rounded-xl bg-green-50 p-4 text-sm text-green-800">{message}</p>}
  </>
}
