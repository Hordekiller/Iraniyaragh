import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DOOR_STATUS_LABELS,
  type DoorCatalog,
  type DoorItemInput,
  type DoorOrderView,
} from "@iranyaragh/contracts";
import { useAuth } from "../state/auth-context";
import {
  AccountNavigation,
  SessionRestoring,
} from "../components/account/AccountNavigation";
import { DoorSummary } from "../components/custom-doors/DoorSummary";
import {
  doorApi,
  doorButton,
  doorCommand,
  doorDigits,
  doorError,
  doorPayment,
  doorRial,
  loadDoorCatalog,
} from "../services/custom-doors/api";
import {
  paymentRedirectUrl,
  redirectToPaymentGateway,
} from "../services/commerce/payment";
import { AuthApiError } from "../lib/auth/errors";
import { formatTimestamp } from "../lib/format";

export function AccountCustomDoorsPage() {
  const auth = useAuth();
  const { id } = useParams<{ id: string }>();
  if (
    auth.state.phase !== "authenticated" &&
    (!auth.restored || auth.state.restoring)
  )
    return <SessionRestoring />;
  if (auth.state.phase !== "authenticated")
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">سفارش‌های ساخت درب من</h1>
        <p className="my-5">برای پیگیری سفارش ساخت، وارد حساب کاربری شوید.</p>
        <button
          type="button"
          onClick={auth.open}
          className={`${doorButton} bg-slate-950 text-white`}
        >
          ورود / ثبت‌نام
        </button>
      </section>
    );
  return (
    <CustomerDoorOrders
      key={`${auth.identityVersion}:${id ?? "list"}`}
      id={id}
    />
  );
}
function CustomerDoorOrders({ id }: { id?: string }) {
  const { request } = useAuth();
  const [order, setOrder] = useState<DoorOrderView | null>(null);
  const [list, setList] = useState<{
    items: DoorOrderView[];
    count: number;
  } | null>(null);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedQuote, setSelectedQuote] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const pending = useRef<{
    action: string;
    input: unknown;
    key: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    alive.current = true;
    const scoped = request.forCurrentPrincipal();
    const load = async () => {
      try {
        if (id) {
          const result = await scoped<{ order: DoorOrderView }>(
            `${doorApi}/${encodeURIComponent(id)}`,
          );
          if (active) setOrder(result.data.order);
        } else {
          const result = await scoped<{
            items: DoorOrderView[];
            count: number;
          }>(`${doorApi}?offset=${offset}&limit=20`);
          if (active) setList(result.data);
        }
      } catch (cause) {
        if (active) setError(doorError(cause));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
      alive.current = false;
    };
  }, [id, request, offset, revision]);
  async function run(action: string, input: unknown) {
    if (!id || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    pending.current ??= { action, input, key: `door-${crypto.randomUUID()}` };
    const command = pending.current,
      scoped = request.forCurrentPrincipal();
    try {
      if (command.action === "payment") {
        if (!order?.quote.snapshot.total || !order.quote.snapshot.deposit)
          throw new Error("A final quote is required");
        const payment = await doorPayment(scoped, id, command.key);
        const paid = BigInt(order.paid),
          deposit = BigInt(order.quote.snapshot.deposit),
          total = BigInt(order.quote.snapshot.total);
        const expected = paid < deposit ? deposit - paid : total - paid;
        const url = paymentRedirectUrl(payment, expected.toString());
        if (!url)
          throw new Error(
            "Payment destination did not match the current quotation",
          );
        if (!alive.current) return;
        redirectToPaymentGateway(url);
      } else {
        const value = await doorCommand(
          scoped,
          id,
          command.action,
          command.input,
          command.key,
        );
        if (alive.current) {
          setOrder(value);
          setMessage("");
          setSelectedQuote(null);
          setEditing(false);
        }
      }
      if (alive.current) {
        pending.current = null;
        setUncertain(false);
      }
    } catch (cause) {
      if (!alive.current) return;
      const ambiguous =
        !(cause instanceof AuthApiError) ||
        cause.statusCode === undefined ||
        cause.statusCode === 0 ||
        cause.statusCode >= 500;
      setUncertain(ambiguous);
      setError(
        ambiguous
          ? "نتیجه درخواست هنوز مشخص نیست؛ تکرار با همان کلید انجام می‌شود. می‌توانید وضعیت را دوباره از سرور دریافت کنید."
          : doorError(cause),
      );
      if (!ambiguous) pending.current = null;
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function upload(file: File | undefined) {
    if (!file || !id || inFlight.current) return;
    if (file.size > 8 * 1024 * 1024) {
      setError("حداکثر اندازه فایل هشت مگابایت است.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      await request.forCurrentPrincipal()(
        `${doorApi}/${encodeURIComponent(id)}/files`,
        { method: "POST", formData, timeoutMs: 45000 },
      );
      if (alive.current) setRevision((v) => v + 1);
    } catch (cause) {
      if (alive.current) setError(doorError(cause));
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function download(fileId: string, filename: string) {
    if (!id) return;
    try {
      const response = await request
        .forCurrentPrincipal()
        .response(
          `${doorApi}/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`,
        );
      const blob = await response.blob();
      if (!alive.current) return;
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      if (alive.current) setError(doorError(cause));
    }
  }
  function reload() {
    setLoading(true);
    setError("");
    setRevision((v) => v + 1);
  }
  const quote =
    order?.quotes.find((q) => q.version === selectedQuote) ?? order?.quote;
  const editable = order && !["COMPLETED", "CANCELLED"].includes(order.status);
  return (
    <section className="door-print mx-auto max-w-[1100px] px-4 py-8">
      <div className="door-no-print">
        <h1 className="text-2xl font-black">سفارش‌های ساخت درب من</h1>
        <AccountNavigation />
        <div className="mb-5 flex flex-wrap gap-2">
          <Link
            to="/custom-doors"
            className={`${doorButton} bg-slate-950 text-white`}
          >
            سفارش جدید
          </Link>
          <button
            type="button"
            onClick={reload}
            disabled={busy || loading}
            className={doorButton}
          >
            دریافت آخرین وضعیت
          </button>
          {id && (
            <Link to="/account/custom-doors" className={doorButton}>
              بازگشت به فهرست
            </Link>
          )}
        </div>
      </div>
      {loading && (
        <p role="status" className="py-5">
          در حال دریافت سفارش‌های شما…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-amber-50 p-4 text-sm leading-7"
        >
          {error}
        </p>
      )}
      {uncertain && (
        <button
          type="button"
          disabled={busy}
          className={`${doorButton} mb-5`}
          onClick={() =>
            void run(pending.current?.action ?? "", pending.current?.input)
          }
        >
          تلاش دوباره با همان درخواست
        </button>
      )}
      {!id && list && (
        <>
          <div className="space-y-4">
            {list.items.map((item) => (
              <Link
                key={item.id}
                to={`/account/custom-doors/${encodeURIComponent(item.id)}`}
                className="flex flex-wrap justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div>
                  <h2 className="font-black">{item.number}</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {formatTimestamp(item.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-bold text-orange-800">
                    {DOOR_STATUS_LABELS[item.status]}
                  </p>
                  <p className="mt-2 text-sm">
                    {doorRial(item.quote.snapshot.total)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          {list.count === 0 && (
            <p className="rounded-2xl bg-slate-50 p-7 text-slate-600">
              هنوز سفارش ساخت درب ثبت نکرده‌اید.
            </p>
          )}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              disabled={offset === 0 || loading}
              className={doorButton}
              onClick={() => {
                setLoading(true);
                setOffset((v) => v - 20);
              }}
            >
              قبلی
            </button>
            <button
              type="button"
              disabled={offset + 20 >= list.count || loading}
              className={doorButton}
              onClick={() => {
                setLoading(true);
                setOffset((v) => v + 20);
              }}
            >
              بعدی
            </button>
          </div>
        </>
      )}
      {order && quote && (
        <>
          <div className="mb-6 rounded-3xl bg-slate-950 p-6 text-white">
            <p className="text-xs text-orange-300">
              ایرانی یراق · سفارش ساخت درب
            </p>
            <h2 className="mt-3 text-xl font-black">{order.number}</h2>
            <p className="mt-3">{DOOR_STATUS_LABELS[order.status]}</p>
            <p className="mt-2 text-xs text-slate-300">
              تاریخ ثبت: {formatTimestamp(order.createdAt)}
            </p>
          </div>
          <div className="door-no-print mb-4 flex flex-wrap gap-3">
            <label className="text-sm font-bold">
              نسخه پیش‌فاکتور
              <select
                value={selectedQuote ?? order.quote.version}
                onChange={(e) => setSelectedQuote(Number(e.target.value))}
                className="mr-2 min-h-11 rounded-xl border border-slate-300 px-3"
              >
                {order.quotes.map((q) => (
                  <option key={q.id} value={q.version}>
                    نسخه {q.version} — {q.approved ? "قطعی" : "نیازمند تأیید"}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={doorButton}
              onClick={() => window.print()}
            >
              چاپ / ذخیره پیش‌فاکتور و رسیدها
            </button>
          </div>
          <DoorSummary quote={quote.snapshot} approved={quote.approved} />
          <section
            className="mt-5 rounded-3xl border border-slate-200 bg-white p-5"
            aria-label="وضعیت مالی سفارش"
          >
            <h2 className="text-lg font-black">حساب سفارش</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-slate-500">پرداخت خالص تأییدشده</dt>
                <dd className="mt-2 font-black">{doorRial(order.paid)}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">مانده قابل تسویه</dt>
                <dd className="mt-2 font-black">{doorRial(order.remaining)}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">اعتبار نیازمند تطبیق</dt>
                <dd className="mt-2 font-black">
                  {doorRial(order.refundableCredit)}
                </dd>
              </div>
            </dl>
            <div className="door-no-print mt-5 flex flex-wrap gap-3">
              {editable &&
                order.quote.approved &&
                order.customerAcceptedQuoteVersion !== order.quote.version && (
                  <button
                    type="button"
                    disabled={busy || uncertain}
                    className={`${doorButton} bg-orange-700 text-white`}
                    onClick={() =>
                      void run("accept", { expectedVersion: order.version })
                    }
                  >
                    تأیید مشخصات و قیمت نسخه {order.quote.version}
                  </button>
                )}
              {editable &&
                order.quote.approved &&
                order.customerAcceptedQuoteVersion === order.quote.version &&
                BigInt(order.remaining ?? "0") > 0n && (
                  <button
                    type="button"
                    disabled={
                      busy ||
                      uncertain ||
                      order.payments.some((p) => p.status === "PENDING")
                    }
                    className={`${doorButton} bg-orange-700 text-white`}
                    onClick={() => void run("payment", undefined)}
                  >
                    {BigInt(order.paid) <
                    BigInt(order.quote.snapshot.deposit ?? "0")
                      ? "پرداخت بیعانه"
                      : "پرداخت مانده سفارش"}
                  </button>
                )}
            </div>
            {order.payments.some((p) => p.status === "PENDING") && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-7">
                یک تلاش پرداخت هنوز باز یا نیازمند تطبیق است. پس از بررسی درگاه،
                وضعیت را دوباره دریافت کنید.
              </p>
            )}
            <h3 className="mt-6 font-bold">رسیدها و سابقه پرداخت</h3>
            {order.payments.length === 0 && (
              <p className="mt-3 text-sm text-slate-500">
                پرداختی ثبت نشده است.
              </p>
            )}
            <ul className="mt-3 space-y-3">
              {order.payments.map((p) => (
                <li key={p.id} className="rounded-xl bg-slate-50 p-4 text-sm">
                  <p>
                    {doorRial(p.amount)} ·{" "}
                    {p.status === "PAID"
                      ? "تأییدشده توسط درگاه"
                      : p.status === "PENDING"
                        ? "باز / نیازمند تطبیق"
                        : p.status === "FAILED"
                          ? "ناموفق"
                          : p.status === "PARTIALLY_REFUNDED"
                            ? "استرداد جزئی ثبت‌شده"
                            : p.status === "REFUNDED"
                              ? "استرداد کامل ثبت‌شده"
                              : "لغوشده"}
                  </p>
                  <p className="mt-2 break-all text-xs text-slate-600">
                    شناسه تراکنش: {p.id} · مرجع: {p.referenceId ?? "ثبت نشده"} ·
                    تاریخ: {formatTimestamp(p.createdAt)}
                  </p>
                  {p.refunded !== "0" && (
                    <p className="mt-2">استرداد: {doorRial(p.refunded)}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {order.status === "DRAFT" && (
            <section className="door-no-print mt-5 rounded-2xl border border-slate-200 p-5">
              <h2 className="font-black">پیش‌نویس سفارش</h2>
              <p className="mt-3 text-sm leading-7">
                پیش از ارسال می‌توانید ابعاد، تعداد و گزینه‌های درب‌ها را ویرایش
                کنید. هنگام ارسال، تعرفه‌های جاری دوباره محاسبه می‌شوند.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  className={doorButton}
                  disabled={busy || uncertain}
                  onClick={() => setEditing((v) => !v)}
                >
                  ویرایش مشخصات
                </button>
                <button
                  type="button"
                  disabled={busy || uncertain || editing}
                  className={`${doorButton} bg-slate-950 text-white`}
                  onClick={() =>
                    void run("submit", { expectedVersion: order.version })
                  }
                >
                  ارسال نهایی پیش‌نویس
                </button>
              </div>
              {editing && (
                <DoorDraftEditor
                  key={order.version}
                  order={order}
                  onSaved={(value) => {
                    setOrder(value);
                    setEditing(false);
                  }}
                />
              )}
            </section>
          )}
          <section className="mt-5 rounded-3xl border border-slate-200 p-5">
            <h2 className="text-lg font-black">پیگیری تولید و پیام‌ها</h2>
            <ol className="mt-4 space-y-4">
              {order.records.map((record) => (
                <li
                  key={record.id}
                  className="border-r-2 border-orange-200 pr-4"
                >
                  <p className="text-sm leading-7">{record.message}</p>
                  <time
                    className="text-xs text-slate-500"
                    dateTime={record.createdAt}
                  >
                    {formatTimestamp(record.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
            {editable && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("messages", { message });
                }}
                className="door-no-print mt-5"
              >
                <label className="block text-sm font-bold">
                  ارسال اطلاعات تکمیلی
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    maxLength={1000}
                    rows={3}
                    disabled={busy || uncertain}
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || uncertain}
                  className={`${doorButton} mt-3`}
                >
                  ارسال پیام
                </button>
              </form>
            )}
          </section>
          <section className="mt-5 rounded-3xl border border-slate-200 p-5">
            <h2 className="font-black">فایل‌های مرجع خصوصی</h2>
            <ul className="my-4 space-y-2">
              {order.attachments.map((file) => (
                <li key={file.id}>
                  <button
                    type="button"
                    className={`${doorButton} break-all`}
                    onClick={() => void download(file.id, file.filename)}
                  >
                    {file.filename} · دریافت فایل
                  </button>
                </li>
              ))}
            </ul>
            {editable && (
              <label className="door-no-print block cursor-pointer rounded-xl text-sm focus-within:ring-2 focus-within:ring-orange-700">
                افزودن تصویر یا PDF، حداکثر هشت مگابایت
                <input
                  type="file"
                  aria-label="افزودن فایل مرجع خصوصی"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  disabled={busy || uncertain}
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                  className="sr-only"
                />
                <span className={`${doorButton} mt-3 w-full bg-slate-50`}>
                  انتخاب تصویر یا PDF و بارگذاری
                </span>
              </label>
            )}
          </section>
          {order.delivery && (
            <section className="mt-5 rounded-2xl bg-emerald-50 p-5">
              <h2 className="font-black">اطلاعات تحویل</h2>
              <p className="mt-3">{order.delivery.recipient}</p>
              <p className="mt-2">{order.delivery.address}</p>
              <p className="mt-2">
                پیگیری: {order.delivery.tracking || "تحویل حضوری"}
              </p>
            </section>
          )}
          {editable &&
            ![
              "IN_PRODUCTION",
              "QUALITY_CONTROL",
              "READY_FOR_DELIVERY",
              "AWAITING_SETTLEMENT",
            ].includes(order.status) && (
              <details className="door-no-print mt-6 rounded-xl border border-slate-200 p-4">
                <summary className="cursor-pointer text-sm font-bold text-red-800">
                  درخواست لغو سفارش
                </summary>
                <p className="mt-3 text-sm leading-7">
                  لغو پیش از تولید و پس از تطبیق پرداخت‌های باز و ثبت استرداد
                  کامل امکان‌پذیر است.
                </p>
                <button
                  type="button"
                  disabled={
                    busy ||
                    uncertain ||
                    BigInt(order.paid) > 0n ||
                    order.payments.some((p) => p.status === "PENDING")
                  }
                  className={`${doorButton} mt-3 text-red-800`}
                  onClick={() =>
                    void run("cancel", {
                      expectedVersion: order.version,
                      status: "CANCELLED",
                      reason: "لغو به درخواست مشتری",
                    })
                  }
                >
                  تأیید لغو سفارش
                </button>
              </details>
            )}
        </>
      )}
    </section>
  );
}
function DoorDraftEditor({
  order,
  onSaved,
}: {
  order: DoorOrderView;
  onSaved: (order: DoorOrderView) => void;
}) {
  const { request } = useAuth();
  const [catalog, setCatalog] = useState<DoorCatalog | null>(null);
  const [items, setItems] = useState(order.items);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<{ items: DoorItemInput[]; key: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void loadDoorCatalog()
      .then((c) => {
        if (alive.current) setCatalog(c);
      })
      .catch((e) => {
        if (alive.current) setError(doorError(e));
      });
    return () => {
      alive.current = false;
    };
  }, []);
  function patch(index: number, input: Partial<DoorItemInput>) {
    setItems((v) =>
      v.map((item, i) => (i === index ? { ...item, ...input } : item)),
    );
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    pending.current ??= { items, key: `door-edit-${crypto.randomUUID()}` };
    try {
      const result = await request.forCurrentPrincipal()<{
        order: DoorOrderView;
      }>(`${doorApi}/${encodeURIComponent(order.id)}/draft`, {
        method: "PUT",
        json: { items: pending.current.items, expectedVersion: order.version },
        headers: {
          "Idempotency-Key": pending.current.key,
        },
      });
      if (alive.current) onSaved(result.data.order);
    } catch (cause) {
      if (alive.current) {
        setError(doorError(cause));
        setUncertain(
          !(cause instanceof AuthApiError) ||
            !cause.statusCode ||
            cause.statusCode >= 500,
        );
        if (
          cause instanceof AuthApiError &&
          cause.statusCode &&
          cause.statusCode < 500
        )
          pending.current = null;
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void save(e)} className="mt-5">
      <fieldset disabled={busy || uncertain} className="space-y-4 border-0 p-0">
        {items.map((item, index) => {
          const model = catalog?.models.find((m) => m.id === item.modelId);
          return (
            <div key={index} className="rounded-xl bg-slate-50 p-4">
              <p className="font-bold">{model?.title ?? "مدل فعلی"}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {(["widthMm", "heightMm", "quantity"] as const).map((key) => (
                  <label key={key} className="text-sm">
                    {key === "widthMm"
                      ? "عرض (میلی‌متر)"
                      : key === "heightMm"
                        ? "ارتفاع (میلی‌متر)"
                        : "تعداد"}
                    <input
                      required
                      inputMode="numeric"
                      value={item[key] || ""}
                      onChange={(e) =>
                        patch(index, {
                          [key]: Number(doorDigits(e.target.value)),
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300 p-3"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {model?.configuration.slots.map((slot) => (
                  <label key={slot.key} className="text-sm">
                    {slot.title}
                    <select
                      value={
                        item.selections.find((s) => s.slot === slot.key)
                          ?.materialId ?? ""
                      }
                      required={slot.required}
                      onChange={(e) =>
                        patch(index, {
                          selections: [
                            ...item.selections.filter(
                              (s) => s.slot !== slot.key,
                            ),
                            ...(e.target.value
                              ? [{ slot: slot.key, materialId: e.target.value }]
                              : []),
                          ],
                        })
                      }
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 p-2"
                    >
                      <option value="">انتخاب کنید</option>
                      {catalog?.materials
                        .filter((m) => slot.materialIds.includes(m.id))
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.title}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              <label className="mt-3 block text-sm">
                توضیحات
                <textarea
                  value={item.notes}
                  onChange={(e) => patch(index, { notes: e.target.value })}
                  maxLength={1000}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-3"
                />
              </label>
              <button
                type="button"
                className={`${doorButton} mt-3`}
                disabled={items.length === 1}
                onClick={() => setItems((v) => v.filter((_, i) => i !== index))}
              >
                حذف این ردیف
              </button>
              <button
                type="button"
                className={`${doorButton} mt-3 mr-2`}
                disabled={items.length >= 50}
                onClick={() => setItems((v) => [...v, structuredClone(item)])}
              >
                تکثیر
              </button>
            </div>
          );
        })}
      </fieldset>
      {error && (
        <p role="alert" className="my-3 text-red-800">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !catalog}
        className={`${doorButton} mt-4 bg-slate-950 text-white`}
      >
        {uncertain ? "تلاش دوباره با همان درخواست" : "ذخیره پیش‌نویس"}
      </button>
    </form>
  );
}
