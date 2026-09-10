import { Link } from 'react-router-dom'
import { Clock3, Instagram, MapPin, Phone } from 'lucide-react'
import { ADDRESS_SHORT, INSTAGRAM_URL, PHONE_MAIN, SITE_NAME, WORKING_HOURS } from '../../lib/site-config'
import { ROUTES } from '../../lib/routes'

export function TopBar() {
  return (
    <div className="hidden lg:block bg-[#070b18] text-white/80 text-[12.5px] border-b border-white/5">
      <div className="max-w-[1280px] mx-auto px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2"><Phone size={14} className="text-[#FF4D00]" /> {PHONE_MAIN}</span>
          <span className="flex items-center gap-2"><MapPin size={14} className="text-[#FF4D00]" /> {ADDRESS_SHORT}</span>
          <span className="flex items-center gap-2"><Clock3 size={14} className="text-[#FF4D00]" /> {WORKING_HOURS}</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to={ROUTES.orders} className="flex items-center gap-2 hover:text-white transition">پیگیری سفارش</Link>
          <span className="w-px h-3 bg-white/20" />
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white transition"><Instagram size={14} /> {SITE_NAME} در اینستاگرام</a>
        </div>
      </div>
    </div>
  )
}