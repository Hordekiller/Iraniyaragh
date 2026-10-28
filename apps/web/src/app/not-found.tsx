import Link from 'next/link'
export const metadata = { title: 'صفحه یافت نشد | ایرانی یراق', robots: { index: false, follow: true } }
export default function NotFound() { return <div className="max-w-[1280px] mx-auto p-8 text-center"><h1 className="text-xl font-black">صفحه یافت نشد</h1><p className="mt-3">نشانی موردنظر موجود نیست یا دیگر منتشر نمی‌شود.</p><Link className="inline-block mt-6 underline" href="/">بازگشت به فروشگاه</Link></div> }
