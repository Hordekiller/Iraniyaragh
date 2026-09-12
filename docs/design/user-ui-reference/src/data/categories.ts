import type { LucideIcon } from "lucide-react";
import {
  Drill,
  Hammer,
  HardHat,
  Ruler,
  Wrench,
  Sprout,
  Flame,
  PaintRoller,
} from "lucide-react";

export interface Category {
  id: string;
  title: string;
  count: number;
  icon: LucideIcon;
  color: string;
}

export const categories: Category[] = [
  {
    id: "power-tools",
    title: "ابزار برقی",
    count: 128,
    icon: Drill,
    color: "from-amber-500 to-orange-600",
  },
  {
    id: "hand-tools",
    title: "ابزار دستی",
    count: 214,
    icon: Hammer,
    color: "from-sky-500 to-blue-600",
  },
  {
    id: "safety",
    title: "تجهیزات ایمنی",
    count: 76,
    icon: HardHat,
    color: "from-emerald-500 to-teal-600",
  },

  {
    id: "measuring",
    title: "ابزار اندازه‌گیری",
    count: 54,
    icon: Ruler,
    color: "from-violet-500 to-purple-600",
  },
  {
    id: "accessories",
    title: "متعلقات و یدکی",
    count: 342,
    icon: Wrench,
    color: "from-rose-500 to-red-600",
  },
  {
    id: "garden",
    title: "ابزار باغبانی",
    count: 89,
    icon: Sprout,
    color: "from-lime-500 to-green-600",
  },
  {
    id: "welding",
    title: "جوشکاری و برشکاری",
    count: 41,
    icon: Flame,
    color: "from-orange-500 to-red-500",
  },
  {
    id: "paint",
    title: "رنگ و پوشش",
    count: 63,
    icon: PaintRoller,
    color: "from-cyan-500 to-sky-600",
  },
];
