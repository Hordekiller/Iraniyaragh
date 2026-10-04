"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type {
  SmsTemplateFields,
  SmsTemplateSettings,
  SmsTemplateSettingsUpdate,
} from "@iranyaragh/contracts";
import type { SmsTemplatesPort } from "@/lib/sms/sms-templates-port";
import {
  SmsNetworkError,
  SmsReauthenticationRequiredError,
  SmsSessionExpiredError,
  SmsVersionConflictError,
} from "@/lib/sms/sms-settings-port";
import { randomUuid } from "@/lib/crypto/random-uuid";

const FIELDS = [
  [
    "otpTemplateId",
    "قالب ورود مشتری",
    "Code",
    "ایران یراق — کد ورود شما: [Code]. این کد را در اختیار دیگران قرار ندهید.",
  ],
  [
    "orderPaidTemplateId",
    "قالب پرداخت سفارش",
    "Order",
    "ایران یراق — پرداخت سفارش [Order] تأیید شد. جزئیات را در حساب کاربری ببینید.",
  ],
  [
    "shipmentDispatchedTemplateId",
    "قالب ارسال مرسوله",
    "Order",
    "ایران یراق — مرسولهٔ سفارش [Order] ارسال شد. وضعیت را در حساب کاربری ببینید.",
  ],
  [
    "shipmentDeliveredTemplateId",
    "قالب تحویل مرسوله",
    "Order",
    "ایران یراق — تحویل مرسولهٔ سفارش [Order] ثبت شد. از خرید شما سپاسگزاریم.",
  ],
] as const;
type Values = Record<keyof SmsTemplateFields, string>;
const EMPTY: Values = {
  otpTemplateId: "",
  orderPaidTemplateId: "",
  shipmentDispatchedTemplateId: "",
  shipmentDeliveredTemplateId: "",
};
const fromSettings = (snapshot: SmsTemplateSettings): Values =>
  Object.fromEntries(
    FIELDS.map(([field]) => [
      field,
      snapshot[field] === null ? "" : String(snapshot[field]),
    ]),
  ) as Values;
function parseId(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/[۰-۹]/gu, (char) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(char)))
    .replace(/[٠-٩]/gu, (char) => String("٠١٢٣٤٥٦٧٨٩".indexOf(char)));
  if (normalized === "") return null;
  if (!/^[1-9]\d{0,9}$/u.test(normalized) || Number(normalized) > 9_999_999_999)
    throw new Error("شناسهٔ قالب باید عدد صحیح مثبت باشد.");
  return Number(normalized);
}

export function SmsTemplatesPanel({ service, onSaved }: { service: SmsTemplatesPort; onSaved?: () => void }) {
  const [snapshot, setSnapshot] = useState<SmsTemplateSettings | null>(null);
  const [values, setValues] = useState<Values>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [reauth, setReauth] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const pending = useRef<SmsTemplateSettingsUpdate | null>(null);

  const showError = useCallback((cause: unknown) => {
    if (
      cause instanceof SmsSessionExpiredError ||
      cause instanceof SmsReauthenticationRequiredError
    ) {
      setReauth(true);
      setError("برای ذخیرهٔ قالب‌ها دوباره با حساب مدیریتی وارد شوید.");
    } else if (cause instanceof SmsNetworkError) {
      setError(
        "ارتباط قطع شد؛ نتیجهٔ ذخیره مشخص نیست. با همان درخواست دوباره تلاش کنید.",
      );
    } else if (cause instanceof SmsVersionConflictError) {
      setError(
        "قالب‌ها در جای دیگری تغییر کرده‌اند. اطلاعات را تازه کنید و تغییرات را دوباره اعمال کنید.",
      );
    } else {
      setError(
        cause instanceof Error
          ? cause.message
          : "دریافت یا ذخیرهٔ قالب‌ها انجام نشد.",
      );
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await service.getTemplates();
      if (!alive.current) return;
      setSnapshot(loaded);
      setValues(fromSettings(loaded));
      pending.current = null;
    } catch (cause) {
      if (alive.current) {
        if (cause instanceof SmsNetworkError)
          setError(
            "ارتباط با سرور برقرار نشد؛ دریافت قالب‌ها را دوباره امتحان کنید.",
          );
        else showError(cause);
      }
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [service, showError]);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!snapshot || inFlight.current || reauth) return;
    let payload: SmsTemplateSettingsUpdate;
    try {
      payload = pending.current ?? {
        expectedVersion: snapshot.version,
        idempotencyKey: randomUuid(),
        ...(Object.fromEntries(
          FIELDS.map(([field]) => [field, parseId(values[field])]),
        ) as SmsTemplateFields),
      };
    } catch (cause) {
      showError(cause);
      return;
    }
    pending.current = payload;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const saved = await service.updateTemplates(payload);
      if (!alive.current) return;
      pending.current = null;
      setSnapshot(saved);
      setValues(fromSettings(saved));
      setSuccess(true);
      onSaved?.();
    } catch (cause) {
      if (!alive.current) return;
      if (!(cause instanceof SmsNetworkError)) pending.current = null;
      showError(cause);
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const unchanged =
    snapshot &&
    FIELDS.every(([field]) => values[field] === fromSettings(snapshot)[field]);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          قالب‌های SMS.ir
        </Typography>
        <Alert severity="info" sx={{ my: 2 }}>
          شناسهٔ چهار قالب تأییدشده را اینجا وارد کنید. ذخیرهٔ شناسه‌ها پیامکی
          ارسال نمی‌کند و سرویس پیامک را فعال نمی‌کند؛ کلید API در تنظیمات خصوصی
          سرور می‌ماند.
        </Alert>
        {loading ? (
          <Skeleton height={200} />
        ) : (
          <>
            {error ? (
              <Alert severity="error" role="alert" sx={{ mb: 2 }}>
                {error}
              </Alert>
            ) : null}
            {success ? (
              <Alert severity="success" role="status" sx={{ mb: 2 }}>
                شناسه‌های قالب ذخیره شدند؛ تأیید provider و دریافت واقعی پیامک
                همچنان باید بررسی شوند.
              </Alert>
            ) : null}
            {reauth ? (
              <Button component="a" href="/login">
                ورود مجدد به پنل
              </Button>
            ) : null}
            {snapshot ? (
              <Box component="form" onSubmit={save}>
                <Stack spacing={3}>
                  {FIELDS.map(([field, label, parameter, copy]) => (
                    <Box key={field}>
                      <TextField
                        fullWidth
                        label={label}
                        value={values[field]}
                        disabled={busy || reauth}
                        slotProps={{
                          htmlInput: {
                            inputMode: "numeric",
                            maxLength: 10,
                            dir: "ltr",
                          },
                        }}
                        helperText={`متغیر الزامی: ${parameter}؛ خالی یعنی هنوز تنظیم نشده است.`}
                        onChange={(event) => {
                          pending.current = null;
                          setSuccess(false);
                          setValues((current) => ({
                            ...current,
                            [field]: event.target.value,
                          }));
                        }}
                      />
                      <Typography
                        variant="caption"
                        component="p"
                        sx={{ mt: 1 }}
                      >
                        {copy}
                      </Typography>
                    </Box>
                  ))}
                  <Typography variant="caption">
                    متن‌ها پیشنهادی‌اند. متغیرها را در پنل SMS.ir اضافه و تعریف
                    تأییدشده را با نام‌های Code و Order تطبیق دهید.
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={busy || reauth || Boolean(unchanged)}
                    >
                      {busy ? "در حال ذخیره..." : "ذخیرهٔ قالب‌ها"}
                    </Button>
                    <Button
                      onClick={() => {
                        setSuccess(false);
                        void load();
                      }}
                      disabled={busy}
                    >
                      بارگذاری مجدد قالب‌ها
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            ) : (
              <Button onClick={() => void load()}>
                تلاش مجدد دریافت قالب‌ها
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
