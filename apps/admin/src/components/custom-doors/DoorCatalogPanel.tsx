"use client";
import { DoorImagePicker } from "./DoorImagePicker";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  DOOR_GLASS_SAMPLES, doorGlassSample, type DoorGlassSampleKey,
  type DoorCatalog,
  type DoorMaterial,
  type DoorModel,
  type DoorModelConfiguration,
} from "@iranyaragh/contracts";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  doorAdmin,
  doorAdminError,
  doorCanonicalNumber,
} from "@/lib/custom-doors/api";
import { apiFetch } from "@/lib/api/client";
import { getAccessToken } from "@/lib/auth/token-store";

const freshModel = (): Omit<DoorModel, "id" | "version" | "imageUrl"> => ({
  code: "",
  title: "",
  type: "FORMLEX",
  active: false,
  imageMediaId: null,
  configuration: {
    technical: null,
    manualApproval: true,
    slots: [],
    incompatible: [],
    components: [],
    labor: null,
    additional: [],
    taxBps: 0,
    discount: "0",
    minimumTotal: "0",
    deposit: null,
  },
});
const freshMaterial = (): Omit<DoorMaterial, "id" | "version"> => ({
  code: "",
  title: "",
  category: "GLASS",
  active: false,
  variantId: null,
  configuration: {
    unit: "M2",
    rate: null,
    validUntil: null,
    specifications: "",
    color: "",
    thicknessMm: null,
    processingFee: "0",
    stockUnit: null,
  },
});
const categories = {
  GLASS: "شیشه",
  PROFILE: "پروفیل",
  HARDWARE: "یراق‌آلات و قطعات",
  SERVICE: "خدمات و تعرفه",
} as const;
export function DoorCatalogPanel({ section = "models" }: { section?: string }) {
  const auth = useAuth();
  if (auth.isRestoring)
    return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!auth.user?.permissions.includes("catalog.read"))
    return <Alert severity="error">مجوز مشاهده کاتالوگ لازم است.</Alert>;
  return (
    <CatalogEditor key={`${auth.user.userId}:${section}`} section={section} />
  );
}
function CatalogEditor({ section }: { section: string }) {
  const auth = useAuth();
  const [catalog, setCatalog] = useState<DoorCatalog | null>(null);
  const [selected, setSelected] = useState<DoorModel | DoorMaterial | null>(
    null,
  );
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<
    { version: number; actorId: string; createdAt: string }[]
  >([]);
  const modelSection = ["models", "rules", "labor", "deposits"].includes(
    section,
  );
  const category =
    section === "glass"
      ? "GLASS"
      : section === "profiles"
        ? "PROFILE"
        : section === "hardware"
          ? "HARDWARE"
          : null;
  useEffect(() => {
    let active = true;
    void doorAdmin<DoorCatalog>("/catalog")
      .then((c) => {
        if (active) setCatalog(c);
      })
      .catch((e) => {
        if (active) setError(doorAdminError(e));
      });
    return () => {
      active = false;
    };
  }, [revision]);
  async function save(path: string, value: unknown) {
    setError("");
    setSaved(false);
    try {
      await doorAdmin(path, "PUT", value);
      setSaved(true);
      setSelected(null);
      setRevision((v) => v + 1);
      return true;
    } catch (e) {
      setError(doorAdminError(e));
      return false;
    }
  }
  async function loadHistory() {
    if (!selected) return;
    try {
      const result = await doorAdmin<{ items: typeof history }>(
        `/history/${modelSection ? "MODEL" : "MATERIAL"}/${encodeURIComponent(selected.id)}`,
      );
      setHistory(result.items);
    } catch (e) {
      setError(doorAdminError(e));
    }
  }
  const canWrite =
    auth.user?.permissions.includes(
      modelSection ? "catalog.write" : "pricing.write",
    ) ?? false;
  return (
    <Box>
      <PageHeader
        title="مدیریت ساخت درب"
        description="مدل، متریال و تعرفه واقعی را وارد کنید. بدون اطلاعات فنی یا قیمت معتبر، سفارش به تأیید مدیر ارجاع می‌شود."
        breadcrumbs={[
          { label: "ساخت درب", href: "/custom-doors/orders" },
          { label: modelSection ? "مدل و قواعد ساخت" : "متریال و تعرفه‌ها" },
        ]}
      />
      <DoorAdminTabs />
      {error && (
        <Alert severity="error" sx={{ my: 2 }}>
          {error}
        </Alert>
      )}
      {saved && (
        <Alert severity="success" sx={{ my: 2 }}>
          نسخه جدید در سرور ذخیره شد. پیش‌فاکتورهای قبلی تغییر نمی‌کنند.
        </Alert>
      )}
      {!catalog && !error && (
        <Typography role="status">در حال دریافت کاتالوگ…</Typography>
      )}
      {catalog && (
        <>
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ my: 2 }}>
            <Button
              onClick={() => {
                setSelected(null);
                setHistory([]);
                setSaved(false);
              }}
              disabled={!canWrite}
            >
              ایجاد {modelSection ? "مدل" : "متریال"} جدید
            </Button>
            {(modelSection
              ? catalog.models
              : catalog.materials.filter(
                  (m) => !category || m.category === category,
                )
            ).map((item) => (
              <Button
                key={item.id}
                variant={selected?.id === item.id ? "contained" : "outlined"}
                onClick={() => {
                  setSelected(item);
                  setHistory([]);
                  setSaved(false);
                }}
              >
                {item.title} · {item.active ? "فعال" : "غیرفعال"}
              </Button>
            ))}
          </Stack>
          {modelSection ? (
            <DoorModelEditor
              key={`${selected?.id ?? "new"}:${revision}`}
              initial={selected as DoorModel | null}
              materials={catalog.materials}
              canWrite={canWrite}
              save={(value) => save("/models", value)}
            />
          ) : (
            <DoorMaterialEditor
              key={`${selected?.id ?? "new"}:${revision}`}
              initial={selected as DoorMaterial | null}
              canWrite={canWrite}
              save={(value) => save("/materials", value)}
            />
          )}
          {selected && (
            <Paper sx={{ p: 2, mt: 2 }}>
              <Button onClick={() => void loadHistory()}>
                تاریخچه نسخه‌ها و ثبت‌کننده تغییر
              </Button>
              {history.map((h) => (
                <Typography key={h.version} variant="body2" sx={{ mt: 1 }}>
                  نسخه {h.version} · ثبت‌کننده: {h.actorId} ·{" "}
                  {new Date(h.createdAt).toLocaleString("fa-IR")}
                </Typography>
              ))}
            </Paper>
          )}
          {auth.user?.permissions.includes("settings.manage") && (
            <DoorNotificationSettings />
          )}
          {auth.user?.permissions.includes("settings.manage") && (
            <Paper sx={{ p: 3, mt: 3 }}>
              <Typography variant="h6">نمایش دکمه شناور سایت</Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={catalog.floatingEnabled}
                    onChange={(_, enabled) =>
                      void save("/visibility", {
                        enabled,
                        expectedVersion: catalog.settingsVersion,
                      })
                    }
                  />
                }
                label="سفارش ساخت درب در صفحات عمومی"
              />
              <Typography variant="body2" color="text.secondary">
                در موبایل، فاصله از منوی پایین و نوار قیمت محصول به‌صورت خودکار
                محاسبه می‌شود.
              </Typography>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}
export function DoorAdminTabs() {
  return (
    <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 3 }}>
      {[
        ["orders", "سفارش‌ها"],
        ["models", "مدل‌ها"],
        ["glass", "شیشه"],
        ["profiles", "پروفیل"],
        ["hardware", "یراق و قطعات"],
        ["labor", "اجرت و مونتاژ"],
        ["rules", "قواعد قیمت"],
        ["production", "تولید"],
        ["reports", "گزارش‌ها"],
      ].map(([path, label]) => (
        <Button key={path} component={Link} href={`/custom-doors/${path}`}>
          {label}
        </Button>
      ))}
    </Stack>
  );
}
function Numeric({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <TextField
      label={label}
      value={value}
      required={required}
      onChange={(e) => onChange(doorCanonicalNumber(e.target.value))}
      inputProps={{ inputMode: "numeric" }}
      fullWidth
    />
  );
}
function DoorModelEditor({
  initial,
  materials,
  canWrite,
  save,
}: {
  initial: DoorModel | null;
  materials: DoorMaterial[];
  canWrite: boolean;
  save: (value: unknown) => Promise<boolean>;
}) {
  const [model, setModel] = useState(() => initial ?? freshModel());
  const [busy, setBusy] = useState(false);
  const cfg = model.configuration;
  const patch = (value: Partial<DoorModelConfiguration>) =>
    setModel((m) => ({
      ...m,
      configuration: { ...m.configuration, ...value },
    }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await save({
        code: model.code,
        title: model.title,
        type: model.type,
        active: model.active,
        imageMediaId: model.imageMediaId,
        configuration: cfg,
        expectedVersion: initial?.version ?? 0,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper
      component="form"
      onSubmit={(e) => void submit(e)}
      sx={{ p: { xs: 2, md: 3 } }}
    >
      <Box
        component="fieldset"
        disabled={!canWrite || busy}
        sx={{ border: 0, p: 0, m: 0 }}
      >
        <Stack gap={3}>
          <Typography variant="h6">
            {initial
              ? `ویرایش ${initial.title} · نسخه ${initial.version}`
              : "مدل جدید — نیازمند پیکربندی"}
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
            <TextField
              required
              label="شناسه یکتا (لاتین)"
              value={model.code}
              disabled={!!initial}
              onChange={(e) =>
                setModel((m) => ({ ...m, code: e.target.value }))
              }
              fullWidth
            />
            <TextField
              required
              label="عنوان واقعی مدل"
              value={model.title}
              onChange={(e) =>
                setModel((m) => ({ ...m, title: e.target.value }))
              }
              fullWidth
            />
            <TextField
              select
              label="نوع درب"
              value={model.type}
              onChange={(e) =>
                setModel((m) => ({
                  ...m,
                  type: e.target.value as DoorModel["type"],
                }))
              }
              fullWidth
            >
              <MenuItem value="FORMLEX">فریم‌لس</MenuItem>
              <MenuItem value="DECOFIX">دکوفیکس</MenuItem>
            </TextField>
          </Stack>
          <FormControlLabel
            control={
              <Switch
                checked={model.active}
                onChange={(_, active) => setModel((m) => ({ ...m, active }))}
              />
            }
            label="انتشار مدل برای مشتری"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cfg.manualApproval}
                onChange={(_, manualApproval) => patch({ manualApproval })}
              />
            }
            label="تأیید دستی قیمت برای این مدل الزامی است"
          />
          <Divider />
          <Typography variant="h6">مشخصات و محدودیت‌های فنی</Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={cfg.technical !== null}
                onChange={(_, configured) =>
                  patch({
                    technical: configured
                      ? {
                          minWidthMm: 0,
                          maxWidthMm: 0,
                          minHeightMm: 0,
                          maxHeightMm: 0,
                          toleranceMm: 0,
                        }
                      : null,
                  })
                }
              />
            }
            label="محدوده و تلرانس واقعی مشخص است"
          />
          {cfg.technical ? (
            <Stack direction={{ xs: "column", md: "row" }} gap={2}>
              {(
                [
                  ["minWidthMm", "حداقل عرض"],
                  ["maxWidthMm", "حداکثر عرض"],
                  ["minHeightMm", "حداقل ارتفاع"],
                  ["maxHeightMm", "حداکثر ارتفاع"],
                  ["toleranceMm", "تلرانس"],
                ] as const
              ).map(([key, label]) => (
                <Numeric
                  key={key}
                  label={`${label} (میلی‌متر)`}
                  value={cfg.technical![key]}
                  onChange={(v) =>
                    patch({
                      technical: { ...cfg.technical!, [key]: Number(v) },
                    })
                  }
                />
              ))}
            </Stack>
          ) : (
            <Alert severity="info">
              بدون قواعد فنی، سفارش به تأیید مدیر ارجاع می‌شود.
            </Alert>
          )}
          <Divider />
          <Typography variant="h6">گزینه‌های قابل انتخاب و سازگاری</Typography>
          {cfg.slots.map((slot, index) => (
            <Paper variant="outlined" key={index} sx={{ p: 2 }}>
              <Stack gap={2}>
                <Stack direction={{ xs: "column", md: "row" }} gap={2}>
                  <TextField
                    required
                    label="کلید لاتین گزینه"
                    value={slot.key}
                    onChange={(e) =>
                      patch({
                        slots: cfg.slots.map((s, i) =>
                          i === index ? { ...s, key: e.target.value } : s,
                        ),
                      })
                    }
                    fullWidth
                  />
                  <TextField
                    required
                    label="عنوان گزینه برای مشتری"
                    value={slot.title}
                    onChange={(e) =>
                      patch({
                        slots: cfg.slots.map((s, i) =>
                          i === index ? { ...s, title: e.target.value } : s,
                        ),
                      })
                    }
                    fullWidth
                  />
                </Stack>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={slot.required}
                      onChange={(_, required) =>
                        patch({
                          slots: cfg.slots.map((s, i) =>
                            i === index ? { ...s, required } : s,
                          ),
                        })
                      }
                    />
                  }
                  label="انتخاب ضروری"
                />
                <Typography variant="body2">
                  متریال‌های مجاز این گزینه
                </Typography>
                <Stack direction="row" flexWrap="wrap">
                  {materials.map((material) => (
                    <FormControlLabel
                      key={material.id}
                      label={material.title}
                      control={
                        <Checkbox
                          checked={slot.materialIds.includes(material.id)}
                          onChange={(_, yes) =>
                            patch({
                              slots: cfg.slots.map((s, i) =>
                                i === index
                                  ? {
                                      ...s,
                                      materialIds: yes
                                        ? [...s.materialIds, material.id]
                                        : s.materialIds.filter(
                                            (id) => id !== material.id,
                                          ),
                                    }
                                  : s,
                              ),
                            })
                          }
                        />
                      }
                    />
                  ))}
                </Stack>
                <Button
                  color="error"
                  onClick={() =>
                    patch({
                      slots: cfg.slots.filter((_, i) => i !== index),
                      components: cfg.components.filter(
                        (c) => c.slot !== slot.key,
                      ),
                    })
                  }
                >
                  حذف گزینه و قواعد آن
                </Button>
              </Stack>
            </Paper>
          ))}
          <Button
            onClick={() =>
              patch({
                slots: [
                  ...cfg.slots,
                  { key: "", title: "", materialIds: [], required: true },
                ],
              })
            }
          >
            افزودن گزینه متریال / رنگ / مکانیزم
          </Button>
          {cfg.incompatible.map((rule, index) => (
            <Paper variant="outlined" key={index} sx={{ p: 2 }}>
              <Typography variant="subtitle2">
                اگر همه موارد زیر انتخاب شوند، ترکیب غیرمجاز است
              </Typography>
              <Stack direction="row" flexWrap="wrap">
                {materials
                  .filter((m) =>
                    cfg.slots.some((s) => s.materialIds.includes(m.id)),
                  )
                  .map((m) => (
                    <FormControlLabel
                      key={m.id}
                      label={m.title}
                      control={
                        <Checkbox
                          checked={rule.materialIds.includes(m.id)}
                          onChange={(_, yes) =>
                            patch({
                              incompatible: cfg.incompatible.map((r, i) =>
                                i === index
                                  ? {
                                      ...r,
                                      materialIds: yes
                                        ? [...r.materialIds, m.id]
                                        : r.materialIds.filter(
                                            (id) => id !== m.id,
                                          ),
                                    }
                                  : r,
                              ),
                            })
                          }
                        />
                      }
                    />
                  ))}
              </Stack>
              <TextField
                label="دلیل ناسازگاری"
                required
                value={rule.reason}
                onChange={(e) =>
                  patch({
                    incompatible: cfg.incompatible.map((r, i) =>
                      i === index ? { ...r, reason: e.target.value } : r,
                    ),
                  })
                }
                fullWidth
              />
              <Button
                color="error"
                onClick={() =>
                  patch({
                    incompatible: cfg.incompatible.filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
              >
                حذف قانون
              </Button>
            </Paper>
          ))}
          <Button
            onClick={() =>
              patch({
                incompatible: [
                  ...cfg.incompatible,
                  { materialIds: [], reason: "" },
                ],
              })
            }
          >
            افزودن قانون ناسازگاری
          </Button>
          <Divider />
          <Typography variant="h6">فرمول مصرف و قیمت هر مدل</Typography>
          <Typography variant="body2" color="text.secondary">
            هر جزء از نرخ متریال انتخاب‌شده و واحد آن استفاده می‌کند. ضریب و
            مخرج، نسبت مصرف را مشخص می‌کنند. این محاسبه مجوز کسر موجودی نیست.
          </Typography>
          {cfg.components.map((rule, index) => {
            const update = (value: Partial<typeof rule>) =>
              patch({
                components: cfg.components.map((r, i) =>
                  i === index ? { ...r, ...value } : r,
                ),
              });
            return (
              <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                <Stack gap={2}>
                  <Stack direction={{ xs: "column", md: "row" }} gap={2}>
                    <TextField
                      select
                      required
                      label="گزینه مربوط"
                      value={rule.slot}
                      onChange={(e) => update({ slot: e.target.value })}
                      fullWidth
                    >
                      {cfg.slots
                        .filter((s) => !!s.key)
                        .map((s) => (
                          <MenuItem key={s.key} value={s.key}>
                            {s.title || s.key}
                          </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                      select
                      label="مبنای مصرف"
                      value={rule.basis}
                      onChange={(e) =>
                        update({ basis: e.target.value as typeof rule.basis })
                      }
                      fullWidth
                    >
                      {[
                        ["AREA", "مساحت برش (مترمربع)"],
                        ["PERIMETER", "محیط برش (متر)"],
                        ["WIDTH", "عرض برش (متر)"],
                        ["HEIGHT", "ارتفاع برش (متر)"],
                        ["FIXED", "تعداد ثابت"],
                      ].map(([v, t]) => (
                        <MenuItem key={v} value={v}>
                          {t}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                  <Stack direction={{ xs: "column", md: "row" }} gap={2}>
                    <Numeric
                      label="ضریب مصرف"
                      value={rule.multiplier}
                      onChange={(v) => update({ multiplier: Number(v) })}
                    />
                    <Numeric
                      label="مخرج نسبت مصرف"
                      value={rule.divisor}
                      onChange={(v) => update({ divisor: Number(v) })}
                    />
                    <Numeric
                      label="پرت (واحد پایه)"
                      value={rule.wasteBps}
                      onChange={(v) => update({ wasteBps: Number(v) })}
                    />
                  </Stack>
                  <Stack direction={{ xs: "column", md: "row" }} gap={2}>
                    <Numeric
                      label="کسر از عرض (میلی‌متر)"
                      value={rule.widthDeductionMm}
                      onChange={(v) => update({ widthDeductionMm: Number(v) })}
                    />
                    <Numeric
                      label="کسر از ارتفاع (میلی‌متر)"
                      value={rule.heightDeductionMm}
                      onChange={(v) => update({ heightDeductionMm: Number(v) })}
                    />
                    <Numeric
                      label="حداقل مقدار تعرفه‌شده (اعشار با نقطه مجاز)"
                      value={rule.minimumQuantity}
                      onChange={(minimumQuantity) =>
                        update({ minimumQuantity })
                      }
                    />
                  </Stack>
                  <Button
                    color="error"
                    onClick={() =>
                      patch({
                        components: cfg.components.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    حذف جزء محاسبه
                  </Button>
                </Stack>
              </Paper>
            );
          })}
          <Button
            onClick={() =>
              patch({
                components: [
                  ...cfg.components,
                  {
                    slot: "",
                    basis: "FIXED",
                    multiplier: 1,
                    divisor: 1,
                    widthDeductionMm: 0,
                    heightDeductionMm: 0,
                    wasteBps: 0,
                    minimumQuantity: "0",
                  },
                ],
              })
            }
          >
            افزودن جزء فرمول
          </Button>
          <Divider />
          <Typography variant="h6">اجرت، خدمات و هزینه‌ها</Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={cfg.labor !== null}
                onChange={(_, yes) =>
                  patch({
                    labor: yes ? { fixed: "", perSquareMeter: "" } : null,
                  })
                }
              />
            }
            label="اجرت مصوب مشخص است"
          />
          {cfg.labor && (
            <Stack direction={{ xs: "column", md: "row" }} gap={2}>
              <Numeric
                label="اجرت ثابت هر درب (ریال)"
                value={cfg.labor.fixed}
                onChange={(fixed) => patch({ labor: { ...cfg.labor!, fixed } })}
              />
              <Numeric
                label="اجرت هر مترمربع (ریال)"
                value={cfg.labor.perSquareMeter}
                onChange={(perSquareMeter) =>
                  patch({ labor: { ...cfg.labor!, perSquareMeter } })
                }
              />
            </Stack>
          )}
          {cfg.additional.map((a, index) => (
            <Stack key={index} direction={{ xs: "column", md: "row" }} gap={2}>
              <TextField
                required
                label="عنوان خدمت / هزینه"
                value={a.title}
                onChange={(e) =>
                  patch({
                    additional: cfg.additional.map((v, i) =>
                      i === index ? { ...v, title: e.target.value } : v,
                    ),
                  })
                }
                fullWidth
              />
              <Numeric
                label="مبلغ هر درب (ریال)"
                value={a.amount}
                onChange={(amount) =>
                  patch({
                    additional: cfg.additional.map((v, i) =>
                      i === index ? { ...v, amount } : v,
                    ),
                  })
                }
              />
              <Button
                color="error"
                onClick={() =>
                  patch({
                    additional: cfg.additional.filter((_, i) => i !== index),
                  })
                }
              >
                حذف
              </Button>
            </Stack>
          ))}
          <Button
            onClick={() =>
              patch({
                additional: [...cfg.additional, { title: "", amount: "" }],
              })
            }
          >
            افزودن خدمت یا هزینه ویژه
          </Button>
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
            <Numeric
              label="مالیات (واحد پایه)"
              value={cfg.taxBps}
              onChange={(v) => patch({ taxBps: Number(v) })}
            />
            <Numeric
              label="تخفیف هر درب (ریال)"
              value={cfg.discount}
              onChange={(discount) => patch({ discount })}
            />
            <Numeric
              label="حداقل قیمت هر درب (ریال)"
              value={cfg.minimumTotal}
              onChange={(minimumTotal) => patch({ minimumTotal })}
            />
          </Stack>
          <Alert severity="info">پرداخت سفارش فقط به مبلغ نهایی تأییدشده انجام می‌شود.</Alert>
          <Divider />
          <DoorImagePicker label="تصویر مدل درب" value={model.imageMediaId} onChange={id => setModel(current => ({ ...current, imageMediaId: id }))} imageUrl={initial?.imageUrl} initialValue={initial?.imageMediaId} originalWidth={initial?.imageOriginalWidth} originalHeight={initial?.imageOriginalHeight} />
          <Button
            type="submit"
            variant="contained"
            disabled={!canWrite || busy}
          >
            {busy ? "در حال ذخیره…" : "ثبت نسخه جدید مدل و قواعد"}
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}
function DoorMaterialEditor({
  initial,
  canWrite,
  save,
}: {
  initial: DoorMaterial | null;
  canWrite: boolean;
  save: (value: unknown) => Promise<boolean>;
}) {
  const [material, setMaterial] = useState(() => initial ?? freshMaterial());
  const [busy, setBusy] = useState(false);
  const [variantSearch, setVariantSearch] = useState("");
  const [variants, setVariants] = useState<
    { id: string; label: string; detail: string | null }[]
  >([]);
  const [error, setError] = useState("");
  const cfg = material.configuration;
  const patch = (value: Partial<DoorMaterial["configuration"]>) =>
    setMaterial((m) => ({
      ...m,
      configuration: { ...m.configuration, ...value },
    }));
  async function search() {
    try {
      const response = await apiFetch<{ items: typeof variants }>(
        `/orders/admin/options?kind=variant&search=${encodeURIComponent(variantSearch)}&limit=25&offset=0`,
        { token: getAccessToken() },
      );
      setVariants(response.data.items);
      setError("");
    } catch (e) {
      setError(doorAdminError(e));
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await save({
        code: material.code,
        title: material.title,
        category: material.category,
        active: material.active,
        variantId: material.variantId,
        configuration: cfg,
        expectedVersion: initial?.version ?? 0,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper component="form" onSubmit={(e) => void submit(e)} sx={{ p: 3 }}>
      <Box
        component="fieldset"
        disabled={!canWrite || busy}
        sx={{ border: 0, p: 0 }}
      >
        <Stack gap={3}>
          <Typography variant="h6">
            {initial
              ? `${initial.title} · نسخه ${initial.version}`
              : "متریال و تعرفه جدید"}
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
            <TextField
              label="شناسه یکتا (لاتین)"
              required
              disabled={!!initial}
              value={material.code}
              onChange={(e) =>
                setMaterial((m) => ({ ...m, code: e.target.value }))
              }
              fullWidth
            />
            <TextField
              required
              label="عنوان متریال / خدمت"
              value={material.title}
              onChange={(e) =>
                setMaterial((m) => ({ ...m, title: e.target.value }))
              }
              fullWidth
            />
            <TextField
              select
              label="دسته"
              value={material.category}
              onChange={(e) =>
                setMaterial((m) => ({
                  ...m,
                  category: e.target.value as DoorMaterial["category"],
                }))
              }
              fullWidth
            >
              {Object.entries(categories).map(([key, title]) => (
                <MenuItem key={key} value={key}>
                  {title}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <FormControlLabel
            control={
              <Switch
                checked={material.active}
                onChange={(_, active) => setMaterial((m) => ({ ...m, active }))}
              />
            }
            label="متریال فعال است"
          />
          <TextField
            select
            label="واحد تعرفه"
            value={cfg.unit}
            onChange={(e) => patch({ unit: e.target.value as typeof cfg.unit })}
          >
            <MenuItem value="M2">مترمربع</MenuItem>
            <MenuItem value="M">متر</MenuItem>
            <MenuItem value="EACH">عدد / واحد خدمت</MenuItem>
          </TextField>
          <FormControlLabel
            control={
              <Checkbox
                checked={cfg.rate !== null}
                onChange={(_, yes) => patch({ rate: yes ? "" : null })}
              />
            }
            label="نرخ مصوب موجود است"
          />
          {cfg.rate !== null && (
            <Numeric
              label="نرخ هر واحد (ریال)"
              value={cfg.rate}
              onChange={(rate) => patch({ rate })}
            />
          )}
          <TextField
            label="پایان اعتبار قیمت (اختیاری)"
            type="datetime-local"
            value={cfg.validUntil?.slice(0, 16) ?? ""}
            onChange={(e) =>
              patch({
                validUntil: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
            slotProps={{ inputLabel: { shrink: true } }}
            helperText="تاریخ خالی یعنی بدون تاریخ انقضای ثبت‌شده."
          />
          <Numeric
            label="هزینه پردازش هر جزء / درب (ریال)"
            value={cfg.processingFee}
            onChange={(processingFee) => patch({ processingFee })}
          />
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
            <TextField
              label="رنگ تأییدشده"
              value={cfg.color}
              onChange={(e) => patch({ color: e.target.value })}
              fullWidth
            />
            <Numeric
              required={false}
              label="ضخامت (میلی‌متر، در صورت کاربرد)"
              value={cfg.thicknessMm ?? ""}
              onChange={(v) => patch({ thicknessMm: v ? Number(v) : null })}
            />
          </Stack>
          <DoorImagePicker label="تصویر شیشه" square value={cfg.imageMediaId ?? null} onChange={id => patch({ imageMediaId: id })} imageUrl={initial?.imageUrl} initialValue={initial?.configuration.imageMediaId} originalWidth={initial?.imageOriginalWidth} originalHeight={initial?.imageOriginalHeight} />
          <TextField select label="تصویر آزمایشی رنگ" value={cfg.sampleKey === null ? '' : cfg.sampleKey ?? doorGlassSample(material.code)?.key ?? ''} onChange={event => patch({ sampleKey: (event.target.value || null) as DoorGlassSampleKey | null })} helperText="نمونه‌های ساخته‌شده با ابعاد ۲۴۰ × ۲۴۰ پیکسل؛ عکس کالای واقعی نیستند. تصویر ثبت‌شده فروشگاه بر این نمونه اولویت دارد. انتخاب تصویر قیمت را تغییر نمی‌دهد.">
            <MenuItem value="">بدون تصویر</MenuItem>
            {DOOR_GLASS_SAMPLES.map(sample => <MenuItem key={sample.key} value={sample.key}>{sample.title}</MenuItem>)}
          </TextField>
          {doorGlassSample(material.code, cfg.sampleKey) && <Box component="img" src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/door-glass-samples/${doorGlassSample(material.code, cfg.sampleKey)!.key}.webp`} alt="نمونه آزمایشی رنگ شیشه" width={160} height={160} sx={{ objectFit: 'cover', borderRadius: 2, maxWidth: '100%' }} />}
          <TextField
            multiline
            rows={3}
            label="مشخصات فنی معتبر"
            value={cfg.specifications}
            onChange={(e) => patch({ specifications: e.target.value })}
          />
          <Divider />
          <Typography variant="h6">اتصال اختیاری به انبار</Typography>
          <Alert severity="info">
            نرخ متر یا مترمربع، واحد موجودی را تغییر نمی‌دهد. برای پروفیل
            شاخه‌ای یا شیشه ورقی، مقدار واقعی قطعات از برنامه برش در سفارش ثبت
            می‌شود.
          </Alert>
          <TextField
            label="جستجوی SKU موجود"
            value={variantSearch}
            onChange={(e) => setVariantSearch(e.target.value)}
          />
          <Button onClick={() => void search()}>جستجوی موجودی واقعی</Button>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            label="SKU مرتبط (اختیاری)"
            value={material.variantId ?? ""}
            onChange={(e) =>
              setMaterial((m) => ({ ...m, variantId: e.target.value || null }))
            }
          >
            <MenuItem value="">بدون اتصال فیزیکی</MenuItem>
            {material.variantId &&
              !variants.some((v) => v.id === material.variantId) && (
                <MenuItem value={material.variantId}>
                  SKU فعلی: {material.variantId}
                </MenuItem>
              )}
            {variants.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.label} {v.detail}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="واحد پایه واقعی SKU"
            value={cfg.stockUnit ?? ""}
            onChange={(e) =>
              patch({
                stockUnit: e.target.value
                  ? (e.target.value as typeof cfg.stockUnit)
                  : null,
              })
            }
          >
            <MenuItem value="">مشخص نشده / خدمت</MenuItem>
            <MenuItem value="PIECE">عدد، ورق یا شاخه کامل</MenuItem>
            <MenuItem value="MM">میلی‌متر (فقط SKU با این واحد پایه)</MenuItem>
            <MenuItem value="MM2">
              میلی‌مترمربع (فقط SKU با این واحد پایه)
            </MenuItem>
          </TextField>
          <Button
            disabled={!material.variantId || !cfg.stockUnit || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await doorAdmin("/stock-unit", "PUT", {
                  variantId: material.variantId,
                  unit: cfg.stockUnit,
                });
              } catch (e) {
                setError(doorAdminError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            پیکربندی واحد پایه برای SKU جدید و بدون گردش
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!canWrite || busy}
          >
            {busy ? "در حال ذخیره…" : "ثبت نسخه جدید تعرفه"}
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}

function DoorNotificationSettings() {
  const [value, setValue] = useState("");
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void doorAdmin<{ templateId: number | null; version: number }>(
      "/notification",
    )
      .then((result) => {
        if (active) {
          setValue(result.templateId === null ? "" : String(result.templateId));
          setVersion(result.version);
        }
      })
      .catch((e) => {
        if (active) setError(doorAdminError(e));
      });
    return () => {
      active = false;
    };
  }, []);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await doorAdmin<{
        templateId: number | null;
        version: number;
      }>("/notification", "PUT", {
        expectedVersion: version,
        templateId: value.trim() ? Number(doorCanonicalNumber(value)) : null,
      });
      setVersion(result.version);
      setValue(result.templateId === null ? "" : String(result.templateId));
    } catch (e) {
      setError(doorAdminError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper sx={{ p: 3, mt: 3 }}>
      <Stack gap={2}>
        <Typography variant="h6">اعلان تأیید پیش‌فاکتور</Typography>
        <Typography variant="body2">
          شناسه قالب واقعی و تأییدشده سامانه پیامک با پارامتر Order را وارد
          کنید. بدون قالب، فقط پیام پنل مشتری ثبت می‌شود؛ پذیرش پیامک به معنی
          تحویل به گوشی نیست.
        </Typography>
        <TextField
          label="شناسه قالب پیامک تأیید قیمت (اختیاری)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputProps={{ inputMode: "numeric" }}
        />
        <Button disabled={busy} onClick={() => void save()}>
          ذخیره سیاست اعلان
        </Button>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Paper>
  );
}
