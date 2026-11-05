import { DOOR_PROFILE_COLORS, DOOR_SIDES } from "@iranyaragh/contracts";
import type { ManufacturingEntry } from "./manufacturing-entry";
const fieldStyle =
  "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
export function DoorManufacturingFields({
  value,
  heightMm,
  onChange,
}: {
  value: ManufacturingEntry;
  heightMm: number;
  onChange: (value: ManufacturingEntry) => void;
}) {
  const maximum = heightMm > 0 ? (heightMm / 10).toLocaleString("fa-IR") : null;
  return (
    <fieldset className="mt-6 rounded-2xl border border-slate-200 p-4">
      <legend className="px-2 font-black">
        پروفیل، دستگیره و محل گازور / لولا
      </legend>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-bold">
          رنگ پروفیل
          <select
            required
            className={fieldStyle}
            value={value.profileColor}
            onChange={(event) =>
              onChange({
                ...value,
                profileColor: event.target
                  .value as ManufacturingEntry["profileColor"],
              })
            }
          >
            <option value="">انتخاب کنید</option>
            {Object.entries(DOOR_PROFILE_COLORS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {(["handleSide", "hingeSide"] as const).map((key) => (
          <label key={key} className="text-sm font-bold">
            {key === "handleSide" ? "سمت دستگیره" : "محل گازور / لولا"}
            <select
              required
              className={fieldStyle}
              value={value[key]}
              onChange={(event) =>
                onChange({ ...value, [key]: event.target.value })
              }
            >
              <option value="">انتخاب کنید</option>
              {Object.entries(DOOR_SIDES).map(([side, label]) => (
                <option key={side} value={side}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="mt-4 block text-sm font-bold">
        حالت سوراخ‌کاری
        <select
          className={fieldStyle}
          value={value.drillingMode}
          onChange={(event) =>
            onChange({
              ...value,
              drillingMode: event.target
                .value as ManufacturingEntry["drillingMode"],
            })
          }
        >
          <option value="STANDARD">استاندارد</option>
          <option value="CUSTOM">سفارشی</option>
        </select>
      </label>
      {value.drillingMode === "STANDARD" ? (
        <p className="mt-3 text-sm text-slate-600">
          جانمایی سوراخ‌ها طبق استاندارد فروشگاه انجام می‌شود.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-sm font-bold">محل نصب لولا (سفارشی)</p>
          {value.holes.map((hole, index) => (
            <fieldset key={index} className="rounded-xl bg-slate-50 p-3">
              <legend className="px-1 text-sm font-bold">
                سوراخ {(index + 1).toLocaleString("fa-IR")}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  فاصلهٔ سوراخ {(index + 1).toLocaleString("fa-IR")} (سانت)
                  <input
                    required
                    inputMode="decimal"
                    dir="ltr"
                    className={fieldStyle}
                    maxLength={12}
                    value={hole.distance}
                    aria-describedby={`hole-limit-${index}`}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        holes: value.holes.map((row, i) =>
                          i === index
                            ? { ...row, distance: event.target.value }
                            : row,
                        ),
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  مرجع سوراخ {(index + 1).toLocaleString("fa-IR")}
                  <select
                    className={fieldStyle}
                    value={hole.reference}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        holes: value.holes.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                reference: event.target.value as
                                  "TOP" | "BOTTOM",
                              }
                            : row,
                        ),
                      })
                    }
                  >
                    <option value="TOP">از بالا</option>
                    <option value="BOTTOM">از پایین</option>
                  </select>
                </label>
              </div>
              <p
                id={`hole-limit-${index}`}
                className="mt-2 text-xs text-slate-600"
              >
                {maximum
                  ? `حداکثر ${maximum} سانت (بیشتر از ارتفاع درب مجاز نیست)`
                  : "ابتدا ارتفاع درب را وارد کنید."}
              </p>
            </fieldset>
          ))}
        </div>
      )}
    </fieldset>
  );
}
