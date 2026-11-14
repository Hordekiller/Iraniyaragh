import { DoorManufacturingFields } from "../components/custom-doors/DoorManufacturingFields";
import { emptyManufacturing, manufacturingEntry, readManufacturing } from "../components/custom-doors/manufacturing-entry";
import { DoorGlassChoices } from "../components/custom-doors/DoorGlassChoices";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  DoorOpen,
  ImageOff,
  Plus,
  Ruler,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import type {
  DoorCatalog,
  DoorItemInput,
  DoorModel,
  DoorOrderView,
  DoorQuoteSnapshot,
  DoorType,
} from "@iranyaragh/contracts";
import { useAuth } from "../state/auth-context";
import { AuthApiError } from "../lib/auth/errors";
import { getCustomerAccount } from "../services/customer-account";
import {
  createDoorOrder,
  doorApi,
  doorButton,
  doorDigits,
  doorError,
  loadDoorCatalog,
  previewDoors,
  readDoorSubmission,
  saveDoorSubmission,
} from "../services/custom-doors/api";
import { DoorSummary } from "../components/custom-doors/DoorSummary";
import { DoorPreview3D } from "../components/custom-doors/DoorPreview3D";
import { HelpHint } from "../components/help/HelpHint";

const inputStyle =
  "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100";
const emptyEntry = {
  modelId: "",
  width: "",
  height: "",
  quantity: "1",
  selections: [] as DoorItemInput["selections"],
  notes: "",
  manufacturing: emptyManufacturing(),
};
type Entry = typeof emptyEntry;
export function CustomDoorsPage() {
  const auth = useAuth();
  return (
    <Configurator
      key={`${auth.identityVersion}:${auth.state.phase === "authenticated" ? auth.state.principal?.userId : "anonymous"}`}
    />
  );
}
function Configurator() {
  const auth = useAuth();
  const userId =
    auth.state.phase === "authenticated"
      ? auth.state.principal?.userId
      : undefined;
  const storageKey = `iranyaragh:door-draft:v1:${userId ?? "anonymous"}`;
  const pendingKey = `${storageKey}:submission`;
  const [restoredSubmission] = useState(() => readDoorSubmission(pendingKey));
  const [catalog, setCatalog] = useState<DoorCatalog | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [stage, setStage] = useState(0);
  const [type, setType] = useState<DoorType>("FORMLEX");
  const [entry, setEntry] = useState<Entry>(emptyEntry);
  const [items, setItems] = useState<DoorItemInput[]>(() => {
    if (restoredSubmission) return restoredSubmission.input.items;
    try {
      const value = JSON.parse(
        sessionStorage.getItem(storageKey) ??
          (userId
            ? sessionStorage.getItem("iranyaragh:door-draft:v1:anonymous")
            : null) ??
          "[]",
      ) as unknown;
      return Array.isArray(value) &&
        value.length <= 50 &&
        value.every(
          (v) =>
            v &&
            typeof v === "object" &&
            typeof v.modelId === "string" &&
            Array.isArray(v.selections),
        )
        ? (value as DoorItemInput[])
        : [];
    } catch {
      return [];
    }
  });
  const [editing, setEditing] = useState<number | null>(null);
  const [quote, setQuote] = useState<DoorQuoteSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(restoredSubmission !== null);
  const [created, setCreated] = useState<DoorOrderView | null>(null);
  const [reference, setReference] = useState<File | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const pending = useRef<
    import("../services/custom-doors/api").DoorSubmission | null
  >(restoredSubmission);

  useEffect(() => {
    alive.current = true;
    let active = true;
    void loadDoorCatalog()
      .then((value) => {
        if (active) {
          setCatalog(value);
          setType(current => value.models.some(model => model.type === current) ? current : value.models[0]?.type ?? current);
          setLoadError("");
        }
      })
      .catch((cause) => {
        if (active) setLoadError(doorError(cause));
      });
    return () => {
      active = false;
      alive.current = false;
    };
  }, [reload]);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(items));
      if (userId)
        sessionStorage.removeItem("iranyaragh:door-draft:v1:anonymous");
    } catch {
      /* Storage can be disabled; form remains in memory. */
    }
  }, [items, storageKey, userId]);
  const model = catalog?.models.find((m) => m.id === entry.modelId);
  function choose(m: DoorModel) {
    setEntry({ ...emptyEntry, modelId: m.id });
    setEditing(null);
    setQuote(null);
    setStage(1);
    setError("");
  }
  function selection(slot: string, materialId: string) {
    setEntry((v) => ({
      ...v,
      selections: [
        ...v.selections.filter((s) => s.slot !== slot),
        ...(materialId ? [{ slot, materialId }] : []),
      ],
    }));
  }
  function incompatible(slot: string, materialId: string) {
    const candidates = [
      ...entry.selections
        .filter((s) => s.slot !== slot)
        .map((s) => s.materialId),
      materialId,
    ];
    return model?.configuration.incompatible.find((rule) =>
      rule.materialIds.every((id) => candidates.includes(id)),
    )?.reason;
  }
  function saveItem(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const widthMm = Number(doorDigits(entry.width)),
      heightMm = Number(doorDigits(entry.height)),
      quantity = Number(doorDigits(entry.quantity));
    if (
      !model ||
      ![widthMm, heightMm, quantity].every(
        (v) => Number.isSafeInteger(v) && v > 0 && v <= 2147483647,
      ) ||
      quantity > 1000
    ) {
      setError(
        "عرض، ارتفاع و تعداد را با عدد صحیح مثبت وارد کنید. حداکثر تعداد هر ردیف هزار است.",
      );
      return;
    }
    if (
      model.configuration.slots.some(
        (slot) =>
          slot.required && !entry.selections.some((s) => s.slot === slot.key),
      )
    ) {
      setError("گزینه‌های ضروری مدل را تکمیل کنید.");
      return;
    }
    let manufacturing;
    try { manufacturing = readManufacturing(entry.manufacturing, heightMm); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "مشخصات سوراخ‌کاری معتبر نیست."); return; }
    const item: DoorItemInput = {
      manufacturing,
      modelId: model.id,
      widthMm,
      heightMm,
      quantity,
      selections: entry.selections,
      notes: entry.notes,
    };
    if (editing === null && items.length >= 50) {
      setError("حداکثر پنجاه ردیف درب در هر سفارش مجاز است.");
      return;
    }
    setItems((current) =>
      editing === null
        ? [...current, item]
        : current.map((v, i) => (i === editing ? item : v)),
    );
    setEditing(null);
    setQuote(null);
    setEntry(emptyEntry);
    setStage(0);
  }
  function edit(index: number) {
    const item = items[index];
    const m = catalog?.models.find((m) => m.id === item.modelId);
    if (!m) {
      setError(
        "مدل این ردیف اکنون فعال نیست؛ آن را حذف و مدل جدید انتخاب کنید.",
      );
      return;
    }
    setEntry({
      modelId: item.modelId,
      width: String(item.widthMm),
      height: String(item.heightMm),
      quantity: String(item.quantity),
      selections: item.selections,
      notes: item.notes,
      manufacturing: manufacturingEntry(item.manufacturing),
    });
    setType(m.type);
    setEditing(index);
    setStage(1);
    setError("");
  }
  async function review() {
    if (inFlight.current || items.length === 0) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await previewDoors({ items });
      if (alive.current) {
        setQuote(value);
        setStage(2);
      }
    } catch (cause) {
      if (alive.current) setError(doorError(cause));
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function submit(draft: boolean) {
    if (auth.state.phase !== "authenticated") {
      auth.open();
      return;
    }
    if (inFlight.current || !items.length) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const request = auth.request.forCurrentPrincipal();
    pending.current ??= {
      key: `door-${crypto.randomUUID()}`,
      input: { items },
      draft,
    };
    const command = pending.current;
    saveDoorSubmission(pendingKey, command);
    try {
      await getCustomerAccount(request);
      const order = await createDoorOrder(
        request,
        command.input,
        command.key,
        command.draft,
      );
      if (!alive.current) return;
      pending.current = null;
      saveDoorSubmission(pendingKey, null);
      setUncertain(false);
      setCreated(order);
      setItems([]);
      if (reference) {
        const data = new FormData();
        data.append("file", reference);
        try {
          await request(`${doorApi}/${encodeURIComponent(order.id)}/files`, {
            method: "POST",
            formData: data,
            timeoutMs: 45000,
          });
          if (alive.current) setReference(null);
        } catch (cause) {
          if (alive.current)
            setError(
              `سفارش ثبت شد؛ بارگذاری فایل تأیید نشد. از جزئیات سفارش دوباره بارگذاری کنید. ${doorError(cause)}`,
            );
        }
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
          ? "نتیجه ثبت مشخص نیست. فرم حفظ شده است؛ تلاش دوباره با همان درخواست انجام می‌شود."
          : doorError(cause),
      );
      if (!ambiguous) {
        pending.current = null;
        saveDoorSubmission(pendingKey, null);
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  if (created)
    return (
      <section className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-7">
          <Check className="text-emerald-700" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-black">
            {created.status === "DRAFT"
              ? "پیش‌نویس ذخیره شد"
              : "سفارش ساخت درب ثبت شد"}
          </h1>
          <p className="mt-3">شماره سفارش: {created.number}</p>
          <p className="mt-3 text-sm leading-7">
            وضعیت قیمت، تأیید مشخصات، مبلغ نهایی و مراحل تولید در حساب کاربری شما
            نمایش داده می‌شود.
          </p>
          <Link
            to={`/account/custom-doors/${encodeURIComponent(created.id)}`}
            className={`${doorButton} mt-5 bg-slate-950 text-white`}
          >
            مشاهده و پیگیری سفارش <ArrowLeft size={17} aria-hidden="true" />
          </Link>
        </div>
        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4">
            {error}
          </p>
        )}
      </section>
    );
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-7 md:py-12">
      <section
        className="grid overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white md:grid-cols-[1.5fr_1fr]"
        aria-labelledby="custom-door-title"
      >
        <div className="p-6 md:p-10">
          <p className="text-sm font-bold text-orange-300">
            اندازه شما، ساخت ایرانی یراق
          </p>
          <h1
            id="custom-door-title"
            className="mt-4 text-2xl font-black leading-relaxed md:text-4xl"
          >
            سفارش آنلاین درب
            <br />
            فریم‌لس و دکوفیکس
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-8 text-slate-300">
            مدل و متریال ثبت‌شده را انتخاب کنید، ابعاد دلخواه را وارد کنید و چند
            درب را در یک سفارش بسازید. مشخصات و قیمت، پیش از پرداخت مبلغ نهایی تأیید
            می‌شوند.
          </p>
          <a
            href="#door-configurator"
            className={`${doorButton} mt-6 border-orange-400 bg-orange-500 text-slate-950`}
          >
            شروع سفارش <ArrowLeft size={17} aria-hidden="true" />
          </a>
        </div>
        <div className="flex min-h-56 flex-col items-center justify-center gap-5 border-t border-slate-700 bg-slate-900 p-7 md:border-t-0 md:border-r">
          <DoorOpen
            size={74}
            strokeWidth={1}
            className="text-orange-300"
            aria-hidden="true"
          />
          <p className="text-sm text-slate-300">
            تصویر هر مدل پس از تأیید ایرانی یراق نمایش داده می‌شود.
          </p>
          <p className="text-xs text-slate-400">
            فریم‌لس · دکوفیکس · ساخت با ابعاد سفارشی
          </p>
        </div>
      </section>
      <ol className="my-7 grid gap-3 sm:grid-cols-3">
        {[
          [Ruler, "انتخاب مدل و ابعاد"],
          [ShieldCheck, "تأیید قیمت و مبلغ نهایی"],
          [Wrench, "تولید و تحویل"],
        ].map(([Icon, title], i) => {
          const StepIcon = Icon as typeof Ruler;
          return (
            <li
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold"
            >
              <StepIcon
                size={22}
                className="text-orange-700"
                aria-hidden="true"
              />
              {String(title)}
            </li>
          );
        })}
      </ol>
      <section
        id="door-configurator"
        className="scroll-mt-24"
        aria-labelledby="door-configurator-title"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-orange-800">
              پیکربندی اختصاصی
            </p>
            <h2
              id="door-configurator-title"
              className="mt-2 text-2xl font-black text-slate-950"
            >
              درب‌های سفارش شما
            </h2>
          </div>
          <Link to="/account/custom-doors" className={`${doorButton} bg-white`}>
            پیگیری سفارش‌های ساخت
          </Link>
        </div>
        <ol aria-label="مراحل ثبت سفارش" className="my-6 flex gap-2 text-sm">
          {["نوع و مدل", "متریال و ابعاد", "بررسی و ثبت"].map((title, i) => (
            <li
              key={title}
              aria-current={stage === i ? "step" : undefined}
              className={`flex-1 rounded-xl border p-3 text-center font-bold ${stage === i ? "border-orange-300 bg-orange-50 text-orange-900" : "border-slate-200 text-slate-500"}`}
            >
              {i + 1}. {title}
            </li>
          ))}
        </ol>
        {loadError && (
          <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-900">
            {loadError}
            <button
              type="button"
              onClick={() => setReload((v) => v + 1)}
              className={`${doorButton} mr-3`}
            >
              دریافت دوباره
            </button>
          </div>
        )}
        {!catalog && !loadError && (
          <p role="status" className="py-8">
            در حال دریافت مدل‌ها و تعرفه‌های معتبر…
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="my-4 rounded-xl bg-amber-50 p-4 text-sm leading-7 text-amber-950"
          >
            {error}
          </p>
        )}
        {catalog && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <fieldset
              disabled={busy || uncertain}
              className="min-w-0 border-0 p-0"
            >
              {stage === 0 && (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                  <h3 className="text-lg font-black">نوع درب را انتخاب کنید <HelpHint target="door-type" label="انتخاب نوع و مدل درب" /></h3>
                  <div
                    className="mt-4 grid grid-cols-2 gap-3"
                    role="group"
                    aria-label="نوع درب"
                    data-help="door-type"
                  >
                    {(["FORMLEX", "DECOFIX"] as const).filter(doorType => catalog.models.some(model => model.type === doorType)).map((t) => (
                      <button
                        type="button"
                        key={t}
                        aria-pressed={type === t}
                        onClick={() => setType(t)}
                        className={`${doorButton} ${type === t ? "border-orange-600 bg-orange-50 text-orange-900" : ""}`}
                      >
                        {t === "FORMLEX" ? "فریم‌لس" : "دکوفیکس"}
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2" data-help="door-models">
                    {catalog.models
                      .filter((m) => m.type === type)
                      .map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => choose(m)}
                          className="overflow-hidden rounded-2xl border border-slate-200 text-right transition-colors hover:border-orange-500"
                        >
                          {m.imageUrl ? (
                            <img
                              src={m.imageUrl}
                              alt={`مدل ${m.title}`}
                              className="aspect-[4/3] w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-slate-100 text-slate-500">
                              <ImageOff size={30} aria-hidden="true" />
                              <span className="text-xs">
                                تصویر مدل هنوز ثبت نشده است
                              </span>
                            </div>
                          )}
                          <div className="p-4">
                            <p className="font-black">{m.title}</p>
                            <p className="mt-2 text-xs text-slate-600">
                              {m.configuration.manualApproval ||
                              !m.configuration.technical
                                ? "با بررسی و تأیید فنی"
                                : "قابل پیکربندی با قواعد ثبت‌شده"}
                            </p>
                          </div>
                        </button>
                      ))}
                  </div>
                  {catalog.models.filter((m) => m.type === type).length ===
                    0 && (
                    <p
                      role="status"
                      className="mt-5 rounded-xl bg-slate-50 p-5 text-sm leading-8 text-slate-600"
                    >
                      مدل تأییدشده‌ای برای{" "}
                      {type === "FORMLEX" ? "فریم‌لس" : "دکوفیکس"} منتشر نشده
                      است. پس از ثبت اطلاعات فنی و تعرفه توسط ایرانی یراق،
                      مدل‌ها در این بخش در دسترس خواهند بود.
                    </p>
                  )}
                </div>
              )}
              {stage === 1 && model && (
                <form
                  onSubmit={saveItem}
                  className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7"
                >
                  <h3 className="text-xl font-black">
                    {editing === null
                      ? "افزودن درب"
                      : `ویرایش درب ${editing + 1}`}{" "}
                    — {model.title}
                  </h3>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {model.configuration.slots.map((slot) => (
                      <label key={slot.key} className="text-sm font-bold">
                        {slot.title}
                        {slot.required ? " *" : " (اختیاری)"}
                        <select
                          required={slot.required}
                          value={
                            entry.selections.find((s) => s.slot === slot.key)
                              ?.materialId ?? ""
                          }
                          onChange={(e) => selection(slot.key, e.target.value)}
                          className={inputStyle}
                        >
                          <option value="">انتخاب کنید</option>
                          {catalog.materials
                            .filter(
                              (m) =>
                                m.active && slot.materialIds.includes(m.id),
                            )
                            .map((m) => {
                              const reason = incompatible(slot.key, m.id);
                              return (
                                <option
                                  key={m.id}
                                  value={m.id}
                                  disabled={!!reason}
                                >
                                  {m.title}
                                  {m.configuration.color
                                    ? ` — ${m.configuration.color}`
                                    : ""}
                                  {m.configuration.thicknessMm
                                    ? ` — ${m.configuration.thicknessMm} میلی‌متر`
                                    : ""}
                                  {reason ? ` (ناسازگار: ${reason})` : ""}
                                </option>
                              );
                            })}
                        </select>
                      </label>
                    ))}
                  </div>
                  {model.configuration.slots.map(slot => <DoorGlassChoices key={slot.key} title={slot.title} materials={catalog.materials.filter(material => material.active && slot.materialIds.includes(material.id))} selected={entry.selections.find(item => item.slot === slot.key)?.materialId ?? ''} onChange={id => selection(slot.key, id)} unavailable={id => incompatible(slot.key, id)} />)}
                  <div className="my-6">
                    <DoorPreview3D
                      type={model.type}
                      widthMm={Number(doorDigits(entry.width)) || 0}
                      heightMm={Number(doorDigits(entry.height)) || 0}
                      material={catalog.materials.find(
                        (m) =>
                          m.category === "GLASS" &&
                          entry.selections.some((s) => s.materialId === m.id),
                      )}
                    />
                    <p className="mt-3 text-center text-xs leading-6">
                      عرض و ارتفاع نهایی را به میلی‌متر وارد کنید؛ تصویر بالا
                      هم‌زمان با ابعاد و رنگ انتخابی به‌روز می‌شود.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {[
                      ["width", "عرض (میلی‌متر)"],
                      ["height", "ارتفاع (میلی‌متر)"],
                      ["quantity", "تعداد"],
                    ].map(([key, title]) => (
                      <div key={key} className="relative">
                      <span className="absolute end-0 top-0"><HelpHint target={`door-${key}`} label={title} /></span>
                      <label className="text-sm font-bold">
                        {title}
                        <input
                          required
                          data-help={`door-${key}`}
                          inputMode="numeric"
                          dir="ltr"
                          value={entry[key as "width" | "height" | "quantity"]}
                          onChange={(e) =>
                            setEntry((v) => ({ ...v, [key]: e.target.value }))
                          }
                          className={inputStyle}
                          maxLength={12}
                        />
                      </label>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-7 text-slate-600">
                    {model.configuration.technical &&
                    model.configuration.technical.maxWidthMm >= 100000
                      ? "قیمت بر اساس متر مربع ابعاد واردشده محاسبه می‌شود."
                      : model.configuration.technical
                      ? `محدوده ثبت‌شده: عرض ${model.configuration.technical.minWidthMm} تا ${model.configuration.technical.maxWidthMm} و ارتفاع ${model.configuration.technical.minHeightMm} تا ${model.configuration.technical.maxHeightMm} میلی‌متر؛ تلرانس ثبت‌شده ${model.configuration.technical.toleranceMm} میلی‌متر. ابعاد خارج از محدوده برای بررسی مدیر ارسال می‌شوند.`
                      : "قواعد فنی مدل هنوز تکمیل نشده است؛ سفارش برای بررسی مدیر ارسال می‌شود."}
                  </p>
                  <DoorManufacturingFields value={entry.manufacturing} heightMm={Number(doorDigits(entry.height))} onChange={manufacturing => setEntry(current => ({ ...current, manufacturing }))} />
                  <label className="mt-5 block text-sm font-bold">
                    توضیحات اختصاصی
                    <textarea
                      value={entry.notes}
                      onChange={(e) =>
                        setEntry((v) => ({ ...v, notes: e.target.value }))
                      }
                      maxLength={1000}
                      rows={3}
                      className={inputStyle}
                    />
                  </label>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      data-help="door-add"
                      className={`${doorButton} bg-slate-950 text-white`}
                    >
                      <Plus size={17} aria-hidden="true" />
                      {editing === null ? "افزودن این درب" : "ذخیره تغییرات"}
                    </button>
                    <button
                      type="button"
                      className={doorButton}
                      onClick={() => {
                        setStage(0);
                        setEditing(null);
                        setEntry(emptyEntry);
                      }}
                    >
                      انتخاب مدل دیگر
                    </button>
                  </div>
                </form>
              )}
              {stage === 2 && quote && (
                <>
                  <DoorSummary quote={quote} />
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                    <label className="block cursor-pointer rounded-xl text-sm font-bold focus-within:ring-2 focus-within:ring-orange-700">
                      تصویر یا فایل مرجع (اختیاری)
                      <input
                        type="file"
                        aria-label="انتخاب تصویر یا فایل مرجع"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          if (file && file.size > 8 * 1024 * 1024) {
                            setError("حداکثر اندازه فایل هشت مگابایت است.");
                            e.target.value = "";
                            return;
                          }
                          setReference(file);
                        }}
                        className="sr-only"
                      />
                      <span className={`${doorButton} mt-3 w-full bg-slate-50`}>
                        انتخاب تصویر یا PDF
                      </span>
                      <span
                        className="mt-2 block break-all text-xs font-normal text-slate-500"
                        aria-live="polite"
                      >
                        {reference?.name ?? "فایلی انتخاب نشده است"}
                      </span>
                    </label>
                    <p className="mt-2 text-xs leading-6 text-slate-600">
                      فایل پس از ثبت سفارش، با دسترسی خصوصی ذخیره و اسکن می‌شود.
                      انتخاب فایل پس از بارگذاری دوباره صفحه باید تکرار شود.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-help="door-submit"
                        onClick={() => void submit(false)}
                        className={`${doorButton} bg-orange-700 text-white`}
                      >
                        {auth.state.phase === "authenticated"
                          ? "ثبت سفارش و بررسی نهایی سرور"
                          : "ورود و ثبت سفارش"}
                      </button>
                      <button
                        type="button"
                        data-help="door-save-draft"
                        onClick={() => void submit(true)}
                        className={doorButton}
                      >
                        ذخیره پیش‌نویس در حساب
                      </button>
                      <button
                        type="button"
                        onClick={() => setStage(0)}
                        className={doorButton}
                      >
                        بازگشت به انتخاب درب
                      </button>
                    </div>
                    <p className="mt-3 text-xs leading-7 text-slate-600">
                      ثبت سفارش، پرداخت محسوب نمی‌شود. پذیرش نسخه قطعی مشخصات و
                      پرداخت مبلغ نهایی در جزئیات سفارش انجام می‌شود.
                    </p>
                  </div>
                </>
              )}
            </fieldset>
            <aside
              className="rounded-3xl border border-slate-200 bg-white p-5"
              aria-label="درب‌های افزوده‌شده"
            >
              <h3 className="font-black">فهرست درب‌ها</h3>
              <p className="mt-2 text-xs text-slate-600">
                مجموع تعداد:{" "}
                {items
                  .reduce((n, i) => n + i.quantity, 0)
                  .toLocaleString("fa-IR")}
              </p>
              {items.length === 0 && (
                <p className="my-5 text-sm leading-7 text-slate-500">
                  با انتخاب یک مدل، اولین درب را به سفارش اضافه کنید.
                </p>
              )}
              <ol className="mt-4 space-y-3">
                {items.map((item, index) => (
                  <li key={index} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-sm font-bold">
                      {index + 1}.{" "}
                      {catalog.models.find((m) => m.id === item.modelId)
                        ?.title ?? "مدل غیرفعال"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {item.widthMm.toLocaleString("fa-IR")} ×{" "}
                      {item.heightMm.toLocaleString("fa-IR")} میلی‌متر ·{" "}
                      {item.quantity.toLocaleString("fa-IR")} عدد
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={busy || uncertain}
                        onClick={() => edit(index)}
                        className={`${doorButton} px-2 text-xs`}
                      >
                        ویرایش
                      </button>
                      <button
                        type="button"
                        aria-label={`تکثیر درب ${index + 1}`}
                        disabled={busy || uncertain || items.length >= 50}
                        onClick={() => {
                          setItems((v) => [...v, structuredClone(item)]);
                          setQuote(null);
                          setStage(0);
                        }}
                        className={`${doorButton} px-2`}
                      >
                        <Copy size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`حذف درب ${index + 1}`}
                        disabled={busy || uncertain}
                        onClick={() => {
                          setItems((v) => v.filter((_, i) => i !== index));
                          setQuote(null);
                          setStage(0);
                          setEditing(null);
                          setEntry(emptyEntry);
                        }}
                        className={`${doorButton} px-2 text-red-800`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                data-help="door-review"
                disabled={busy || uncertain || !items.length}
                onClick={() => void review()}
                className={`${doorButton} mt-5 w-full bg-slate-950 text-white`}
              >
                {busy ? "در حال بررسی…" : "محاسبه و بررسی سفارش"}
              </button>
              {uncertain && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(pending.current?.draft ?? false)}
                  className={`${doorButton} mt-3 w-full`}
                >
                  تلاش دوباره با همان درخواست
                </button>
              )}
              <p className="mt-3 text-xs leading-6 text-slate-500">
                درب‌های افزوده‌شده در همین مرورگر حفظ می‌شوند. مدل و تعرفه معتبر
                از سرور دریافت می‌شود.
              </p>
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
