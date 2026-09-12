export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  image: string;
  date: string;
  readTime: string;
  category: string;
}

export const blogPosts: BlogPost[] = [
  {
    id: "post-1",
    title: "راهنمای کامل خرید دریل شارژی مناسب",
    excerpt:
      "قبل از خرید دریل شارژی به این نکات مهم درباره ولتاژ، باتری و گشتاور توجه کنید تا بهترین انتخاب را داشته باشید.",
    image: "/images/blog/blog1.jpg",
    date: "۱۴۰۳/۰۵/۱۲",
    readTime: "۶ دقیقه",
    category: "راهنمای خرید",
  },
  {
    id: "post-2",
    title: "۱۰ نکته ایمنی ضروری هنگام کار با ابزار برقی",
    excerpt:
      "رعایت نکات ایمنی هنگام استفاده از ابزار برقی می‌تواند شما را از حوادث ناخواسته در محیط کار و منزل حفظ کند.",
    image: "/images/blog/blog2.jpg",
    date: "۱۴۰۳/۰۴/۲۸",
    readTime: "۴ دقیقه",
    category: "ایمنی",
  },
  {
    id: "post-3",
    title: "تفاوت ابزار برقی و بادی؛ کدام را انتخاب کنیم؟",
    excerpt:
      "بررسی تفاوت‌های کلیدی بین ابزارهای برقی و بادی از نظر کارایی، هزینه و کاربرد در پروژه‌های مختلف.",
    image: "/images/blog/blog3.jpg",
    date: "۱۴۰۳/۰۴/۱۰",
    readTime: "۵ دقیقه",
    category: "آموزشی",
  },
  {
    id: "post-4",
    title: "روش صحیح نگهداری و تعمیر ابزار فلزی",
    excerpt:
      "با رعایت چند اصل ساده در نگهداری ابزار فلزی، عمر مفید آن‌ها را چند برابر کنید و از زنگ‌زدگی جلوگیری کنید.",
    image: "/images/blog/blog4.jpg",
    date: "۱۴۰۳/۰۳/۲۲",
    readTime: "۳ دقیقه",
    category: "نگهداری",
  },
];
