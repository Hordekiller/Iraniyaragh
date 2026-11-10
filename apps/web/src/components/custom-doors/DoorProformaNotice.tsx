import type { DoorOrderView } from "@iranyaragh/contracts";

const HEADINGS: Partial<Record<DoorOrderView["financialStatus"], string>> = {
  UNPRICED: "پیش‌فاکتور — پرداخت نشده",
  UNPAID: "پیش‌فاکتور — پرداخت نشده",
  PARTIAL: "پیش‌فاکتور — پرداخت کامل نشده",
};

/** Kept outside `.door-no-print`: the warning must appear on the printed copy. */
export function DoorProformaNotice({
  financialStatus,
}: {
  financialStatus: DoorOrderView["financialStatus"];
}) {
  const heading = HEADINGS[financialStatus];
  if (!heading) return null;
  return (
    <p
      role="note"
      className="mb-4 rounded-2xl border-2 border-red-700 bg-red-50 p-4 text-sm leading-7 text-red-900"
    >
      <strong className="block text-base font-black">{heading}</strong>
      این سند فاکتور فروش یا رسید پرداخت نیست. فاکتور نهایی فقط پس از پرداخت کامل
      صادر می‌شود.
    </p>
  );
}
