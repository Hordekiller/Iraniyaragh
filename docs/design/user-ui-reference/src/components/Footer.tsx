import {
  Wrench,
  Phone,
  Mail,
  MapPin,
  Instagram,
  Send,
  Twitter,
} from "lucide-react";
import { toPersianDigits } from "../lib/utils";

const quickLinks = [
  { label: "خانه", id: "home" },
  { label: "دسته‌بندی‌ها", id: "categories" },
  { label: "محصولات پرفروش", id: "products" },
  { label: "خدمات", id: "services" },
  { label: "وبلاگ", id: "blog" },
  { label: "درباره ما", id: "about" },
];

const categoryLinks = [
  "ابزار برقی",
  "ابزار دستی",
  "تجهیزات ایمنی",
  "ابزار اندازه‌گیری",
  "جوشکاری و برشکاری",
];

export default function Footer() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <footer className="bg-[#0a0c0f] border-t border-white/5 pt-16 pb-28 lg:pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8 pb-12 border-b border-white/5">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600">
                <Wrench className="w-5 h-5 text-[#0f1216]" strokeWidth={2.5} />
              </span>
              <span className="text-lg font-black text-white">
                ابزار<span className="text-amber-500">پرو</span>
              </span>
            </div>
            <p className="text-stone-500 text-sm leading-7 mb-5">
              فروشگاه تخصصی ابزار برقی، دستی و تجهیزات ایمنی با گارانتی اصالت و ارسال سریع به سراسر
              کشور.
            </p>
            <div className="flex items-center gap-2">
              {[Instagram, Send, Twitter].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-stone-400 hover:text-amber-400 hover:border-amber-500/40 transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-white font-bold mb-5">دسترسی سریع</h4>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.id}>
                  <button
                    onClick={() => scrollTo(link.id)}
                    className="text-stone-500 text-sm hover:text-amber-400 transition-colors"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-5">دسته‌بندی محصولات</h4>
            <ul className="space-y-3">
              {categoryLinks.map((cat) => (
                <li key={cat}>
                  <button
                    onClick={() => scrollTo("categories")}
                    className="text-stone-500 text-sm hover:text-amber-400 transition-colors"
                  >
                    {cat}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-5">تماس با ما</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-stone-500 text-sm">
                <MapPin className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                تهران، خیابان ولیعصر، پلاک ۱۲۴
              </li>
              <li className="flex items-center gap-3 text-stone-500 text-sm">
                <Phone className="w-4 h-4 text-amber-500 shrink-0" />
                {toPersianDigits("021-88776655")}
              </li>
              <li className="flex items-center gap-3 text-stone-500 text-sm">
                <Mail className="w-4 h-4 text-amber-500 shrink-0" />
                info@abzarpro.ir
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-stone-600 text-xs text-center sm:text-right">
            © {toPersianDigits(1403)} ابزارپرو. تمامی حقوق محفوظ است.
          </p>
          <div className="flex items-center gap-4 text-stone-600 text-xs">
            <span>قوانین و مقررات</span>
            <span className="w-1 h-1 rounded-full bg-stone-700" />
            <span>حریم خصوصی</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
