export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviews: number;
  image: string;
  badge?: string;
  sold?: number;
}

export const products: Product[] = [
  {
    id: "drill-01",
    name: "دریل شارژی حرفه‌ای ۲۰ ولت",
    category: "ابزار برقی",
    price: 4250000,
    oldPrice: 5100000,
    rating: 4.8,
    reviews: 312,
    image: "/images/products/drill.jpg",
    badge: "پرفروش",
    sold: 1240,
  },
  {
    id: "grinder-01",
    name: "فرز آهنگری صنعتی ۱۲۰۰ وات",
    category: "ابزار برقی",
    price: 2870000,
    oldPrice: 3200000,
    rating: 4.6,
    reviews: 198,
    image: "/images/products/grinder.jpg",
    badge: "تخفیف",
    sold: 860,
  },
  {
    id: "screwdriver-01",
    name: "ست پیچ‌گوشتی برقی ۴۶ پارچه",
    category: "ابزار دستی",
    price: 1180000,
    rating: 4.9,
    reviews: 421,
    image: "/images/products/screwdriver-set.jpg",
    badge: "جدید",
    sold: 2015,
  },
  {
    id: "jigsaw-01",
    name: "اره عمودبر برقی متغیر سرعت",
    category: "ابزار برقی",
    price: 3390000,
    oldPrice: 3790000,
    rating: 4.5,
    reviews: 156,
    image: "/images/products/jigsaw.jpg",
    sold: 540,
  },
  {
    id: "compressor-01",
    name: "کمپرسور باد پرتابل ۵۰ لیتری",
    category: "ابزار برقی",
    price: 8900000,
    rating: 4.7,
    reviews: 89,
    image: "/images/products/compressor.jpg",
    badge: "پرفروش",
    sold: 410,
  },
  {
    id: "toolbox-01",
    name: "جعبه ابزار حرفه‌ای ۱۲۰ پارچه",
    category: "ابزار دستی",
    price: 3650000,
    oldPrice: 4100000,
    rating: 4.9,
    reviews: 512,
    image: "/images/products/toolbox.jpg",
    badge: "تخفیف",
    sold: 1870,
  },
  {
    id: "welder-01",
    name: "دستگاه جوش اینورتر ۲۰۰ آمپر",
    category: "جوشکاری و برشکاری",
    price: 6450000,
    rating: 4.6,
    reviews: 134,
    image: "/images/products/welder.jpg",
    sold: 320,
  },
  {
    id: "laser-01",
    name: "متر لیزری دیجیتال دقت بالا",
    category: "ابزار اندازه‌گیری",
    price: 1950000,
    oldPrice: 2300000,
    rating: 4.8,
    reviews: 267,
    image: "/images/products/laser-meter.jpg",
    badge: "جدید",
    sold: 980,
  },
];
