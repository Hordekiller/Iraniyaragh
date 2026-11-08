/**
 * Delivery provinces for staff-entered orders. The API accepts any `[A-Z0-9_-]+`
 * code, so this list is the single place that keeps the codes and Persian names
 * consistent. Existing codes are kept; missing provinces use the usual 3-letter code.
 */
export type ProvinceOption = { value: string; label: string };

export const PROVINCES: readonly ProvinceOption[] = [
  { value: 'THR', label: 'تهران' },
  { value: 'ABZ', label: 'البرز' },
  { value: 'ADL', label: 'اردبیل' },
  { value: 'EAZ', label: 'آذربایجان شرقی' },
  { value: 'WAZ', label: 'آذربایجان غربی' },
  { value: 'BHR', label: 'بوشهر' },
  { value: 'CHB', label: 'چهارمحال و بختیاری' },
  { value: 'ESF', label: 'اصفهان' },
  { value: 'FRS', label: 'فارس' },
  { value: 'GIL', label: 'گیلان' },
  { value: 'GLS', label: 'گلستان' },
  { value: 'HDN', label: 'همدان' },
  { value: 'HRZ', label: 'هرمزگان' },
  { value: 'ILM', label: 'ایلام' },
  { value: 'KBD', label: 'کهگیلویه و بویراحمد' },
  { value: 'KHZ', label: 'خوزستان' },
  { value: 'KRB', label: 'کرمانشاه' },
  { value: 'KRD', label: 'کردستان' },
  { value: 'KRN', label: 'کرمان' },
  { value: 'LRS', label: 'لرستان' },
  { value: 'MKZ', label: 'مرکزی' },
  { value: 'MZN', label: 'مازندران' },
  { value: 'NKH', label: 'خراسان شمالی' },
  { value: 'QOM', label: 'قم' },
  { value: 'QZV', label: 'قزوین' },
  { value: 'RKH', label: 'خراسان رضوی' },
  { value: 'SBN', label: 'سیستان و بلوچستان' },
  { value: 'SKH', label: 'خراسان جنوبی' },
  { value: 'SMN', label: 'سمنان' },
  { value: 'YAZ', label: 'یزد' },
  { value: 'ZNJ', label: 'زنجان' },
];
