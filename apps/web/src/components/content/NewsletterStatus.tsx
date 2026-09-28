import { useEffect } from 'react'

const LEGACY_NEWSLETTER_STORAGE_KEY = 'iranyaragh.newsletter.subscriptions.v1'

export function NewsletterStatus() {
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_NEWSLETTER_STORAGE_KEY)
    } catch {
      // Storage may be unavailable; there is no subscription flow to resume.
    }
  }, [])

  return (
    <section aria-labelledby="newsletter-status-title" className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-6">
      <div className="rounded-[24px] lg:rounded-[28px] bg-[#0F172A] p-5 lg:p-7 text-white">
        <h2 id="newsletter-status-title" className="font-black text-[18px] lg:text-[20px]">خبرنامه هنوز فعال نیست</h2>
        <p className="text-white/85 text-[13px] mt-1.5 leading-6">
          ثبت‌نام و ارسال کد تخفیف در حال حاضر انجام نمی‌شود. پس از راه‌اندازی سرویس واقعی، امکان عضویت در همین صفحه اعلام خواهد شد.
        </p>
      </div>
    </section>
  )
}
