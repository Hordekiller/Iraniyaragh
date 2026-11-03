import type { DoorQuoteSnapshot } from "@iranyaragh/contracts";
import { doorRial } from "../../services/custom-doors/api";

export function DoorSummary({
  quote,
  approved = false,
}: {
  quote: DoorQuoteSnapshot;
  approved?: boolean;
}) {
  return (
    <section
      className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7"
      aria-label="خلاصه سفارش درب"
    >
      <h2 className="text-xl font-black text-slate-950">
        جزئیات و برآورد سفارش
      </h2>
      <p className="mt-2 text-sm leading-7 text-slate-600">
        {approved
          ? "قیمت قطعی این نسخه از پیش‌فاکتور"
          : quote.total !== null
            ? "محاسبه خودکار؛ قیمت و مشخصات هنگام ثبت، دوباره در سرور بررسی می‌شود."
            : "این سفارش نیازمند بررسی مدیر است؛ بیعانه پس از تأیید قیمت فعال می‌شود."}
      </p>
      <div className="mt-5 space-y-4">
        {quote.lines.map((line, index) => (
          <article key={index} className="rounded-2xl bg-slate-50 p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-black">
                {index + 1}.{" "}
                {line.model.type === "FORMLEX" ? "فریم‌لس" : "دکوفیکس"} —{" "}
                {line.title}
              </h3>
              <span>{line.quantity.toLocaleString("fa-IR")} عدد</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              عرض {line.widthMm.toLocaleString("fa-IR")} × ارتفاع{" "}
              {line.heightMm.toLocaleString("fa-IR")} میلی‌متر
            </p>
            <ul className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
              {line.materials.map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1"
                >
                  {m.title}
                  {m.configuration.color ? ` · ${m.configuration.color}` : ""}
                  {m.configuration.thicknessMm
                    ? ` · ${m.configuration.thicknessMm} میلی‌متر`
                    : ""}
                </li>
              ))}
            </ul>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="inline text-slate-500">واحد: </dt>
                <dd className="inline font-bold">
                  {line.unitTotal === null && approved && line.total !== null
                    ? "مبلغ در جمع ردیف ثبت شده است"
                    : doorRial(line.unitTotal)}
                </dd>
              </div>
              <div>
                <dt className="inline text-slate-500">جمع ردیف: </dt>
                <dd className="inline font-bold">{doorRial(line.total)}</dd>
              </div>
            </dl>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-slate-600">
                ریز محاسبه اولیه و تعرفه‌ها
              </summary>
              <ul className="mt-2 space-y-1">
                {line.parts.map((part, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{part.title}</span>
                    <span>{doorRial(part.amount)}</span>
                  </li>
                ))}
                <li>
                  اجرت ثابت:{" "}
                  {doorRial(line.model.configuration.labor?.fixed ?? null)}
                </li>
                {line.model.configuration.additional.map((a, i) => (
                  <li key={i}>
                    {a.title}: {doorRial(a.amount)}
                  </li>
                ))}
                <li>
                  مالیات:{" "}
                  {new Intl.NumberFormat("fa-IR").format(
                    line.model.configuration.taxBps / 100,
                  )}
                  ٪ · تخفیف: {doorRial(line.model.configuration.discount)}
                </li>
              </ul>
            </details>
          </article>
        ))}
      </div>
      {quote.reasons.length > 0 && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-7 text-amber-950">
          <p className="font-bold">موارد بررسی فنی و قیمت</p>
          <ul className="list-inside list-disc">
            {quote.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {quote.adjustments.length > 0 && (
        <ul className="mt-4 text-sm">
          {quote.adjustments.map((a, i) => (
            <li key={i}>
              {a.title}: {doorRial(a.amount)}
            </li>
          ))}
        </ul>
      )}
      {quote.approvalReason && (
        <p className="mt-4 text-sm leading-7">
          توضیح تأیید قیمت: {quote.approvalReason}
        </p>
      )}
      <dl className="mt-5 space-y-3 border-t border-slate-200 pt-5">
        <div className="flex justify-between gap-3 font-black">
          <dt>
            {approved
              ? "مبلغ قطعی"
              : quote.total !== null
                ? "جمع محاسبه‌شده"
                : "قیمت قطعی"}
          </dt>
          <dd>{doorRial(quote.total)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>بیعانه</dt>
          <dd>{doorRial(quote.deposit)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-sm text-slate-600">
          <dt>مانده پس از بیعانه</dt>
          <dd>
            {doorRial(
              quote.total !== null && quote.deposit !== null
                ? (BigInt(quote.total) - BigInt(quote.deposit)).toString()
                : null,
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
