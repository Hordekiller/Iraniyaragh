import type { LucideIcon } from "lucide-react";
import { Truck, ShieldCheck, Headset, Wrench, BadgePercent, PackageCheck } from "lucide-react";

export interface Service {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const services: Service[] = [
  {
    id: "shipping",
    title: "ارسال سریع و مطمئن",
    description: "ارسال سفارشات به سراسر کشور با پست پیشتاز و باربری در کمترین زمان ممکن",
    icon: Truck,
  },
  {
    id: "warranty",
    title: "ضمانت اصالت و سلامت",
    description: "تمامی محصولات دارای گارانتی اصالت و سلامت فیزیکی کالا هستند",
    icon: ShieldCheck,
  },
  {
    id: "support",
    title: "مشاوره تخصصی رایگان",
    description: "کارشناسان ما پیش و پس از خرید همراه شما خواهند بود",
    icon: Headset,
  },
  {
    id: "repair",
    title: "تعمیر و خدمات پس از فروش",
    description: "خدمات تعمیر و نگهداری ابزار در تعمیرگاه مجاز فروشگاه",
    icon: Wrench,
  },
  {
    id: "discount",
    title: "تخفیف‌های ویژه عمده",
    description: "برای خرید عمده و پیمانکاران تخفیف‌های استثنایی در نظر گرفته شده است",
    icon: BadgePercent,
  },
  {
    id: "cod",
    title: "ضمانت بازگشت کالا",
    description: "در صورت نارضایتی تا ۷ روز امکان بازگشت کالا و عودت وجه وجود دارد",
    icon: PackageCheck,
  },
];
