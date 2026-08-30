import { Clock3, Instagram, MapPin, Phone } from 'lucide-react'

export function TopBar() {
  return (
    <div className="hidden lg:block bg-[#070b18] text-white/80 text-[12.5px] border-b border-white/5">
      <div className="max-w-[1280px] mx-auto px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2"><Phone size={14} className="text-[#FF4D00]" /> ۰۲۱-۸۸۸۸۸۸۸۸</span>
          <span className="flex items-center gap-2"><MapPin size={14} className="text-[#FF4D00]" /> تهران، خیابان امام خمینی، پاساژ ابزار</span>
          <span className="flex items-center gap-2"><Clock3 size={14} className="text-[#FF4D00]" /> شنبه تا پنجشنبه ۸ تا ۲۰</span>
        </div>
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-2">پیگیری سفارش</span>
          <span className="w-px h-3 bg-white/20" />
          <span className="flex items-center gap-2"><Instagram size={14} /> ایران یراق در اینستاگرام</span>
        </div>
      </div>
    </div>
  )
}