import type { LucideIcon } from 'lucide-react'

export type Product = {
  id: number
  title: string
  brand: string
  price: number
  oldPrice?: number
  rating: number
  reviews: number
  image: string
  badge?: string
  cat: string
}

export type Category = {
  id: number
  title: string
  en: string
  count: string
  icon: LucideIcon
  image: string
  color: string
}

export type HeroSlide = {
  id: number
  badge: string
  title: string
  highlight: string
  desc: string
  cta: string
  cta2: string
  image: string
  gradient: string
  accent: string
}

export type BlogPost = {
  id: number
  title: string
  excerpt: string
  date: string
  read: string
  image: string
  tag: string
}

export type Service = {
  icon: LucideIcon
  title: string
  desc: string
  color: string
}