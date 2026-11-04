/** Synthetic illustrative samples; not photographs of stocked products or color guarantees. */
export const DOOR_GLASS_SAMPLES = [
  {
    "code": "decofix-glass-clear-4mm",
    "key": "clear",
    "title": "شفاف"
  },
  {
    "code": "decofix-glass-frosted-4mm",
    "key": "frosted",
    "title": "مات یخی"
  },
  {
    "code": "decofix-glass-white-4mm",
    "key": "white",
    "title": "سفید"
  },
  {
    "code": "decofix-glass-cream-4mm",
    "key": "cream",
    "title": "کرم"
  },
  {
    "code": "decofix-glass-light-smoke-4mm",
    "key": "light-smoke",
    "title": "دودی روشن"
  },
  {
    "code": "decofix-glass-dark-smoke-4mm",
    "key": "dark-smoke",
    "title": "دودی تیره"
  },
  {
    "code": "decofix-glass-black-4mm",
    "key": "black",
    "title": "مشکی"
  },
  {
    "code": "decofix-glass-bronze-4mm",
    "key": "bronze",
    "title": "برنزی"
  },
  {
    "code": "decofix-glass-amber-4mm",
    "key": "amber",
    "title": "طلایی کهربایی"
  },
  {
    "code": "decofix-glass-brown-4mm",
    "key": "brown",
    "title": "قهوه‌ای"
  },
  {
    "code": "decofix-glass-light-green-4mm",
    "key": "light-green",
    "title": "سبز روشن"
  },
  {
    "code": "decofix-glass-green-4mm",
    "key": "green",
    "title": "سبز"
  },
  {
    "code": "decofix-glass-light-blue-4mm",
    "key": "light-blue",
    "title": "آبی روشن"
  },
  {
    "code": "decofix-glass-navy-4mm",
    "key": "navy",
    "title": "سرمه‌ای"
  },
  {
    "code": "decofix-glass-red-4mm",
    "key": "red",
    "title": "قرمز"
  },
  {
    "code": "decofix-glass-pink-4mm",
    "key": "pink",
    "title": "صورتی"
  }
] as const;
export type DoorGlassSampleKey = typeof DOOR_GLASS_SAMPLES[number]["key"];
export function doorGlassSample(code: string, key?: string | null) {
  if (key === null) return null;
  return DOOR_GLASS_SAMPLES.find(sample => key === undefined ? sample.code === code : sample.key === key) ?? null;
}
