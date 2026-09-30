import { PackageCheck, Truck } from 'lucide-react'

/**
 * Fulfillment notice shown under the buy box.
 *
 * Shipping cost, delivery windows and any authenticity/warranty promise are
 * business policy that the storefront cannot assert from delivered data, so
 * nothing is quoted here. The two statements below are the only facts the
 * storefront can stand behind: availability is read from live inventory and the
 * shipping cost is decided by the server during checkout.
 */
export function DeliveryNotice() {
  return (
    <ul className="flex flex-col sm:flex-row items-start sm:items-center justify-center gap-x-6 gap-y-2 mt-6 text-xs text-slate-500 rounded-2xl bg-slate-50 py-3 px-4">
      <li className="flex items-center gap-1.5">
        <PackageCheck size={15} aria-hidden="true" className="shrink-0" />
        <span>موجودی و قیمت در لحظه ثبت سفارش بررسی می‌شود.</span>
      </li>
      <li className="flex items-center gap-1.5">
        <Truck size={15} aria-hidden="true" className="shrink-0" />
        <span>هزینه ارسال در مرحله نهایی سفارش محاسبه می‌شود.</span>
      </li>
    </ul>
  )
}
