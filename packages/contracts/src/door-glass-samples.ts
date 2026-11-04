/** Synthetic illustrations, not photographs of inventory or color guarantees. */
const GLASS_PALETTE = [
  ["clear", "شفاف"],
  ["frosted", "مات یخی"],
  ["white", "سفید"],
  ["cream", "کرم"],
  ["light-smoke", "دودی روشن"],
  ["dark-smoke", "دودی تیره"],
  ["black", "مشکی"],
  ["bronze", "برنزی"],
  ["amber", "طلایی کهربایی"],
  ["brown", "قهوه‌ای"],
  ["light-green", "سبز روشن"],
  ["green", "سبز"],
  ["light-blue", "آبی روشن"],
  ["navy", "سرمه‌ای"],
  ["red", "قرمز"],
  ["pink", "صورتی"],
] as const;

export type DoorGlassSampleKey = typeof GLASS_PALETTE[number][0];
export const DOOR_GLASS_SAMPLES = GLASS_PALETTE.map(([key, title]) => ({
  code: `decofix-glass-${key}-4mm`, key, title,
}));

export function doorGlassSample(code: string, key?: string | null) {
  if (key === null) return null;
  return DOOR_GLASS_SAMPLES.find(sample => key === undefined ? sample.code === code : sample.key === key) ?? null;
}
