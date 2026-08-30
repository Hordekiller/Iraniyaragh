export function scrollCarousel(ref: React.RefObject<HTMLDivElement | null>, dir: 'left' | 'right') {
  if (!ref.current) return
  const amount = 340
  ref.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
}

export function formatToman(value: number) {
  return value.toLocaleString('fa-IR')
}

export function discountPercent(price: number, oldPrice: number) {
  return Math.round((1 - price / oldPrice) * 100)
}