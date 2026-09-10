export function scrollCarousel(ref: React.RefObject<HTMLDivElement | null>, dir: 'left' | 'right') {
  if (!ref.current) return
  const amount = 340
  ref.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
}

/** Format a Toman-styled value with Persian locale digits (prototype display only). */
export function formatTomanDisplay(value: number): string {
  return value.toLocaleString('fa-IR')
}

export function discountPercent(price: number, oldPrice: number) {
  return Math.round((1 - price / oldPrice) * 100)
}
