"use client";

import { doorManufacturingSummary } from "@iranyaragh/contracts";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  DOOR_STATUS_LABELS,
  type DoorOrderView,
  type DoorStatus,
} from "@iranyaragh/contracts";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ApiClientError } from "@/lib/api/client";
import { listLocations, listWarehouses } from "@/lib/inventory/warehouses-api";
import { getAccessToken } from "@/lib/auth/token-store";
import {
  doorAdmin,
  doorAdminError,
  doorCanonicalNumber,
  doorKey,
  doorMoneyLabel,
} from "@/lib/custom-doors/api";
import { DoorAdminTabs } from "./DoorCatalogPanel";

export function DoorOrdersPanel({
  id,
  report = false,
}: {
  id?: string;
  report?: boolean;
}) {
  const auth = useAuth();
  if (auth.isRestoring)
    return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!auth.user?.permissions.includes(report ? "reports.read" : "orders.read"))
    return <Alert severity="error">مجوز مشاهده این بخش لازم است.</Alert>;
  return (
    <DoorOrdersContent
      key={`${auth.user.userId}:${id ?? (report ? "report" : "list")}`}
      id={id}
      report={report}
    />
  );
}
function DoorOrdersContent({ id, report }: { id?: string; report: boolean }) {
  const auth = useAuth();
  const [list, setList] = useState<{
    items: DoorOrderView[];
    count: number;
  } | null>(null);
  const [order, setOrder] = useState<DoorOrderView | null>(null);
  const [totals, setTotals] = useState<{
    count: number;
    quotedTotal: string;
    paid: string;
    remaining: string;
    statuses: { status: DoorStatus; count: number }[];
  } | null>(null);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [nextStatus, setNextStatus] = useState<DoorStatus>(
    "AWAITING_TECHNICAL_APPROVAL",
  );
  const [delivery, setDelivery] = useState({
    recipient: "",
    address: "",
    tracking: "",
  });
  const alive = useRef(true);
  const flight = useRef(false);
  const pending = useRef<{ path: string; input: unknown; key: string } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    alive.current = true;
    const load = async () => {
      try {
        if (id) {
          const result = await doorAdmin<{ order: DoorOrderView }>(
            `/orders/${encodeURIComponent(id)}`,
          );
          if (active) {
            setOrder(result.order);
            if (result.order.delivery) setDelivery(result.order.delivery);
          }
        } else if (report) {
          const result = await doorAdmin<NonNullable<typeof totals>>("/report");
          if (active) setTotals(result);
        } else {
          const result = await doorAdmin<{
            items: DoorOrderView[];
            count: number;
          }>(`/orders?offset=${offset}&limit=25`);
          if (active) setList(result);
        }
      } catch (e) {
        if (active) setError(doorAdminError(e));
      }
    };
    void load();
    return () => {
      active = false;
      alive.current = false;
    };
  }, [id, report, offset, revision]);
  async function command(path: string, input: unknown) {
    if (flight.current) return false;
    flight.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    pending.current ??= { path, input, key: doorKey() };
    const cmd = pending.current;
    try {
      const result = await doorAdmin<{ order: DoorOrderView }>(
        cmd.path,
        "POST",
        cmd.input,
        cmd.key,
      );
      if (!alive.current) return false;
      setOrder(result.order);
      pending.current = null;
      setUncertain(false);
      setSuccess("عملیات در سرور ثبت شد.");
      setReason("");
      setMessage("");
      return true;
    } catch (e) {
      if (!alive.current) return false;
      const ambiguous = !(e instanceof ApiClientError) || e.statusCode >= 500;
      setUncertain(ambiguous);
      setError(doorAdminError(e));
      if (!ambiguous) pending.current = null;
      return false;
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function file(fileId: string, filename: string) {
    if (!id) return;
    try {
      const response = await fetch(
        `/api/v1/custom-doors/admin/orders/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`,
        {
          headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (!alive.current) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (alive.current)
        setError("دریافت فایل تأیید نشد؛ دسترسی و اتصال را بررسی کنید.");
    }
  }
  const canManage = auth.user?.permissions.includes("orders.manage") ?? false;
  const canStock =
    canManage && (auth.user?.permissions.includes("inventory.adjust") ?? false);
  return (
    <Box>
      <PageHeader
        title={
          report
            ? "گزارش ساخت درب"
            : id
              ? `سفارش ساخت درب ${order?.number ?? ""}`
              : "سفارش‌های ساخت درب"
        }
        description="وضعیت مالی از تولید جداست. پرداخت‌ها، استرداد و گزارش مالی از زیرساخت اصلی فروشگاه استفاده می‌کنند."
        breadcrumbs={[
          { label: "مدیریت ساخت درب", href: "/custom-doors/orders" },
          { label: id ? "جزئیات سفارش" : report ? "گزارش" : "فهرست سفارش‌ها" },
        ]}
      />
      <DoorAdminTabs />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
      <Stack direction="row" gap={2} sx={{ mb: 3 }}>
        <Button
          onClick={() => {
            setError("");
            setRevision((v) => v + 1);
          }}
          disabled={busy}
        >
          دریافت آخرین وضعیت
        </Button>
        {id && (
          <Button component={Link} href="/custom-doors/orders">
            فهرست سفارش‌ها
          </Button>
        )}
        {uncertain && (
          <Button
            disabled={busy}
            onClick={() =>
              void command(pending.current!.path, pending.current!.input)
            }
          >
            تلاش دوباره با همان درخواست
          </Button>
        )}
      </Stack>
      {!id && !report && !list && !error && (
        <Typography role="status">در حال دریافت سفارش‌ها…</Typography>
      )}
      {list && (
        <Stack gap={2}>
          {list.items.length === 0 && (
            <Alert severity="info">هنوز سفارش ساخت درب ثبت نشده است.</Alert>
          )}
          {list.items.map((item) => (
            <Paper key={item.id} sx={{ p: 3 }}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                gap={2}
                justifyContent="space-between"
              >
                <Box>
                  <Typography fontWeight={800}>
                    {item.number} · {item.customerLabel}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {DOOR_STATUS_LABELS[item.status]} ·{" "}
                    {new Date(item.createdAt).toLocaleString("fa-IR")}
                  </Typography>
                </Box>
                <Box>
                  <Typography>
                    {doorMoneyLabel(item.quote.snapshot.total)}
                  </Typography>
                  <Typography variant="body2">
                    پرداخت خالص: {doorMoneyLabel(item.paid)}
                  </Typography>
                </Box>
                <Button
                  component={Link}
                  href={`/custom-doors/orders/${encodeURIComponent(item.id)}`}
                >
                  مشاهده و مدیریت
                </Button>
              </Stack>
            </Paper>
          ))}
          <Stack direction="row" gap={2}>
            <Button
              disabled={offset === 0}
              onClick={() => setOffset((v) => v - 25)}
            >
              قبلی
            </Button>
            <Button
              disabled={offset + 25 >= list.count}
              onClick={() => setOffset((v) => v + 25)}
            >
              بعدی
            </Button>
            <Typography>{list.count.toLocaleString("fa-IR")} سفارش</Typography>
          </Stack>
        </Stack>
      )}
      {totals && (
        <Stack gap={3}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">
              تمام سفارش‌های ساخت · مبالغ ریالی
            </Typography>
            <Typography sx={{ mt: 2 }}>
              تعداد سفارش: {totals.count.toLocaleString("fa-IR")}
            </Typography>
            <Typography>
              جمع قیمت‌های قطعی فعال: {doorMoneyLabel(totals.quotedTotal)}
            </Typography>
            <Typography>
              پرداخت خالص تأییدشده: {doorMoneyLabel(totals.paid)}
            </Typography>
            <Typography>
              مانده سفارش‌ها: {doorMoneyLabel(totals.remaining)}
            </Typography>
          </Paper>
          {totals.statuses.map((s) => (
            <Paper key={s.status} sx={{ p: 2 }}>
              <Typography>
                {DOOR_STATUS_LABELS[s.status]}:{" "}
                {s.count.toLocaleString("fa-IR")}
              </Typography>
            </Paper>
          ))}
          <Button component={Link} href="/reports">
            گزارش‌های مالی و عملیاتی فروشگاه
          </Button>
        </Stack>
      )}
      {order && (
        <Stack gap={3}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">
              {order.number} · {DOOR_STATUS_LABELS[order.status]}
            </Typography>
            <Typography sx={{ mt: 2 }}>مشتری: {order.customerLabel}</Typography>
            <Button
              component={Link}
              href={`/customers/${encodeURIComponent(order.customerId)}`}
            >
              پرونده مشتری
            </Button>
            <Typography>
              قیمت قطعی: {doorMoneyLabel(order.quote.snapshot.total)} · بیعانه:{" "}
              {doorMoneyLabel(order.quote.snapshot.deposit)}
            </Typography>
            <Typography>
              پرداخت خالص: {doorMoneyLabel(order.paid)} · مانده:{" "}
              {doorMoneyLabel(order.remaining)}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              نسخه سفارش: {order.version} · نسخه قیمت: {order.quote.version} ·
              پذیرش مشتری:{" "}
              {order.customerAcceptedQuoteVersion === order.quote.version
                ? "نسخه جاری پذیرفته شده"
                : "در انتظار پذیرش"}{" "}
              · تأیید فنی:{" "}
              {order.technicalApproved ? "انجام شده" : "انجام نشده"}
            </Typography>
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">مشخصات و ریز قیمت</Typography>
            {order.quote.snapshot.lines.map((line, index) => (
              <Box key={index} sx={{ py: 2 }}>
                <Typography fontWeight={800}>
                  {index + 1}.{" "}
                  {line.model.type === "FORMLEX" ? "فریم‌لس" : "دکوفیکس"} —{" "}
                  {line.title}
                </Typography>
                <Typography variant="body2">
                  عرض {line.widthMm} × ارتفاع {line.heightMm} میلی‌متر ·{" "}
                  {line.quantity} عدد · جمع: {doorMoneyLabel(line.total)}
                </Typography>
                <Typography variant="body2">
                  توضیح مشتری: {order.items[index]?.notes || "ندارد"}
                </Typography>
                {doorManufacturingSummary(line.manufacturing).map(text => <Typography key={text} variant="body2">{text}</Typography>)}
                {line.parts.map((part, i) => (
                  <Typography key={i} variant="body2">
                    {part.title} — مقدار محاسباتی {part.quantityNumerator}/
                    {part.quantityDenominator} {part.unit} — تعرفه هر درب:{" "}
                    {doorMoneyLabel(part.amount)}
                  </Typography>
                ))}
                <Typography variant="body2">
                  اجرت ثابت:{" "}
                  {doorMoneyLabel(
                    line.model.configuration.labor?.fixed ?? null,
                  )}{" "}
                  · اجرت مترمربع:{" "}
                  {doorMoneyLabel(
                    line.model.configuration.labor?.perSquareMeter ?? null,
                  )}
                </Typography>
                <Divider sx={{ mt: 2 }} />
              </Box>
            ))}
            {order.quote.snapshot.reasons.map((reason, i) => (
              <Alert key={i} severity="warning" sx={{ mt: 1 }}>
                {reason}
              </Alert>
            ))}
            <Typography sx={{ mt: 2 }}>
              جمع قابل محاسبه قبل از تأیید:{" "}
              {doorMoneyLabel(order.quote.snapshot.calculatedTotal)}
            </Typography>
          </Paper>
          {canManage &&
            auth.user?.permissions.includes("pricing.write") &&
            [
              "PENDING_QUOTE_APPROVAL",
              "AWAITING_DEPOSIT",
              "DEPOSIT_PAID",
              "AWAITING_TECHNICAL_APPROVAL",
            ].includes(order.status) && (
              <QuoteApprovalEditor
                key={order.version}
                order={order}
                disabled={busy || uncertain}
                save={(input) => command(`/orders/${order.id}/quote`, input)}
              />
            )}
          {canManage && (
            <Paper sx={{ p: 3 }}>
              <Box
                component="fieldset"
                disabled={busy || uncertain}
                sx={{ border: 0, p: 0 }}
              >
                <Stack gap={2}>
                  <Typography variant="h6">بررسی فنی و وضعیت تولید</Typography>
                  <TextField
                    label="شرح بررسی / دلیل تغییر"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    multiline
                    rows={2}
                    inputProps={{ maxLength: 1000 }}
                  />
                  {["DEPOSIT_PAID", "AWAITING_TECHNICAL_APPROVAL"].includes(
                    order.status,
                  ) && (
                    <Button
                      disabled={!reason.trim()}
                      onClick={() =>
                        void command(`/orders/${order.id}/technical`, {
                          expectedVersion: order.version,
                          status: "AWAITING_TECHNICAL_APPROVAL",
                          reason,
                        })
                      }
                    >
                      ثبت تأیید مشخصات فنی این نسخه
                    </Button>
                  )}
                  <TextField
                    select
                    label="وضعیت درخواستی"
                    value={nextStatus}
                    onChange={(e) =>
                      setNextStatus(e.target.value as DoorStatus)
                    }
                  >
                    {Object.entries(DOOR_STATUS_LABELS)
                      .filter(
                        ([key]) =>
                          ![
                            "DRAFT",
                            "PENDING_QUOTE_APPROVAL",
                            "AWAITING_DEPOSIT",
                            "DEPOSIT_PAID",
                          ].includes(key),
                      )
                      .map(([key, label]) => (
                        <MenuItem key={key} value={key}>
                          {label}
                        </MenuItem>
                      ))}
                  </TextField>
                  {[
                    "READY_FOR_DELIVERY",
                    "AWAITING_SETTLEMENT",
                    "COMPLETED",
                  ].includes(nextStatus) && (
                    <>
                      <TextField
                        label="گیرنده"
                        value={delivery.recipient}
                        onChange={(e) =>
                          setDelivery((v) => ({
                            ...v,
                            recipient: e.target.value,
                          }))
                        }
                      />
                      <TextField
                        label="نشانی / محل تحویل"
                        value={delivery.address}
                        onChange={(e) =>
                          setDelivery((v) => ({
                            ...v,
                            address: e.target.value,
                          }))
                        }
                      />
                      <TextField
                        label="کد رهگیری (اختیاری)"
                        value={delivery.tracking}
                        onChange={(e) =>
                          setDelivery((v) => ({
                            ...v,
                            tracking: e.target.value,
                          }))
                        }
                      />
                    </>
                  )}
                  <Button
                    variant="contained"
                    disabled={!reason.trim()}
                    onClick={() =>
                      void command(`/orders/${order.id}/status`, {
                        expectedVersion: order.version,
                        status: nextStatus,
                        reason,
                        ...(delivery.recipient && delivery.address
                          ? { delivery }
                          : {}),
                      })
                    }
                  >
                    ثبت انتقال وضعیت با کنترل قواعد سرور
                  </Button>
                  <Typography variant="caption">
                    پس از شروع تولید، لغو عادی مجاز نیست. لغو پیش از تولید نیز
                    به تطبیق پرداخت‌های باز و ثبت استرداد کامل نیاز دارد.
                  </Typography>
                </Stack>
              </Box>
            </Paper>
          )}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">
              نیازمندی متریال و برنامه مصرف واقعی
            </Typography>
            <Alert severity="info" sx={{ my: 2 }}>
              مقدار محاسباتی قیمت، مقدار برداشت انبار نیست. تعداد واقعی شاخه،
              ورق، قطعه یا واحد پایه SKU را با دلیل برنامه برش تأیید کنید.
            </Alert>
            {order.requirements.length === 0 && (
              <Typography>
                پس از تأیید قیمت، Snapshot نیازمندی متریال ایجاد می‌شود.
              </Typography>
            )}
            {order.requirements.map((r) => (
              <RequirementEditor
                key={`${r.id}:${order.version}`}
                requirement={r}
                order={order}
                canStock={canStock && !busy && !uncertain}
                command={command}
              />
            ))}
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">پرداخت‌ها و استرداد</Typography>
            {order.payments.length === 0 && (
              <Typography sx={{ mt: 2 }}>پرداختی ثبت نشده است.</Typography>
            )}
            {order.payments.map((p) => (
              <Box key={p.id} sx={{ mt: 2 }}>
                <Typography>
                  {doorMoneyLabel(p.amount)} · {p.status} · استرداد:{" "}
                  {doorMoneyLabel(p.refunded)}
                </Typography>
                <Typography variant="caption">
                  مرجع: {p.referenceId ?? "ثبت نشده"} · نسخه قیمت:{" "}
                  {order.quotes.find((q) => q.id === p.quoteId)?.version ??
                    "نامشخص"}
                </Typography>
                <Button
                  component={Link}
                  href={`/payments/${encodeURIComponent(p.id)}`}
                >
                  رسید، تطبیق و ثبت استرداد در سامانه پرداخت موجود
                </Button>
              </Box>
            ))}
          </Paper>
          {canManage &&
            auth.user?.permissions.includes("invoices.write") &&
            auth.user?.permissions.includes("customers.read") && (
              <DoorInvoiceBridge order={order} />
            )}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">تاریخچه نسخه‌های پیش‌فاکتور</Typography>
            {order.quotes.map((q) => (
              <Box component="details" key={q.id} sx={{ mt: 2 }}>
                <summary>
                  نسخه {q.version} · {q.approved ? "قطعی" : "نیازمند تأیید"} ·{" "}
                  {doorMoneyLabel(q.snapshot.total)}
                </summary>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  بیعانه: {doorMoneyLabel(q.snapshot.deposit)} · توضیح تأیید:{" "}
                  {q.snapshot.approvalReason ?? "محاسبه اولیه"}
                </Typography>
                {q.snapshot.adjustments.map((a, i) => (
                  <Typography key={i} variant="body2">
                    {a.title}: {doorMoneyLabel(a.amount)}
                  </Typography>
                ))}
              </Box>
            ))}
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">فایل‌های مرجع</Typography>
            {order.attachments.map((a) => (
              <Button key={a.id} onClick={() => void file(a.id, a.filename)}>
                {a.filename} · دریافت خصوصی
              </Button>
            ))}
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">پیگیری و پیام‌های سفارش</Typography>
            {order.records.map((r) => (
              <Box
                key={r.id}
                sx={{
                  mt: 2,
                  pr: 2,
                  borderRight: "2px solid",
                  borderColor: "divider",
                }}
              >
                <Typography variant="body2">{r.message}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(r.createdAt).toLocaleString("fa-IR")}
                </Typography>
              </Box>
            ))}
            {canManage && (
              <Stack
                component="form"
                gap={2}
                sx={{ mt: 3 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void command(`/orders/${order.id}/messages`, { message });
                }}
              >
                <TextField
                  required
                  multiline
                  rows={3}
                  label="پیام مشتری / درخواست اطلاعات تکمیلی"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={busy || uncertain}
                  inputProps={{ maxLength: 1000 }}
                />
                <Button type="submit" disabled={busy || uncertain}>
                  ثبت پیام در پنل مشتری
                </Button>
              </Stack>
            )}
          </Paper>
        </Stack>
      )}
    </Box>
  );
}
function QuoteApprovalEditor({
  order,
  disabled,
  save,
}: {
  order: DoorOrderView;
  disabled: boolean;
  save: (input: unknown) => Promise<boolean>;
}) {
  const [total, setTotal] = useState(
    order.quote.snapshot.total ?? order.quote.snapshot.calculatedTotal ?? "",
  );
  const [lineTotals, setLineTotals] = useState(
    order.quote.snapshot.lines.map((line) => ({
      total: line.total ?? "",
      reason: "",
    })),
  );
  const [kind, setKind] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [value, setValue] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [reason, setReason] = useState("");
  const [extras, setExtras] = useState<{ title: string; amount: string }[]>([]);
  return (
    <Paper
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        void save({
          expectedVersion: order.version,
          total,
          lineTotals,
          depositPolicy: { kind, value, minimum },
          adjustments: extras,
          reason,
        });
      }}
      sx={{ p: 3 }}
    >
      <Box component="fieldset" disabled={disabled} sx={{ border: 0, p: 0 }}>
        <Stack gap={2}>
          <Typography variant="h6">تأیید یا اصلاح نسخه قیمت</Typography>
          <Alert severity="warning">
            قیمت قطعی شامل تمام هزینه‌ها و مالیات است. تغییر پس از بیعانه به
            پذیرش دوباره مشتری نیاز دارد؛ پرداخت‌ها حفظ می‌شوند. پیش از اصلاح،
            پرداخت باز باید تطبیق و رزرو فعال آزاد شود.
          </Alert>
          {lineTotals.map((line, index) => (
            <Stack key={index} direction={{ xs: "column", md: "row" }} gap={2}>
              <TextField
                required
                label={`قیمت قطعی ردیف ${index + 1} (ریال)`}
                value={line.total}
                onChange={(e) =>
                  setLineTotals((v) =>
                    v.map((x, i) =>
                      i === index
                        ? { ...x, total: doorCanonicalNumber(e.target.value) }
                        : x,
                    ),
                  )
                }
                fullWidth
              />
              <TextField
                required
                label={`دلیل قیمت ردیف ${index + 1}`}
                value={line.reason}
                onChange={(e) =>
                  setLineTotals((v) =>
                    v.map((x, i) =>
                      i === index ? { ...x, reason: e.target.value } : x,
                    ),
                  )
                }
                fullWidth
              />
            </Stack>
          ))}
          <TextField
            required
            label="جمع قطعی نهایی شامل هزینه‌های جانبی (ریال)"
            value={total}
            onChange={(e) => setTotal(doorCanonicalNumber(e.target.value))}
            inputProps={{ inputMode: "numeric" }}
          />
          {extras.map((a, index) => (
            <Stack key={index} direction={{ xs: "column", md: "row" }} gap={2}>
              <TextField
                required
                label="عنوان / دلیل هزینه جانبی"
                value={a.title}
                onChange={(e) =>
                  setExtras((v) =>
                    v.map((x, i) =>
                      i === index ? { ...x, title: e.target.value } : x,
                    ),
                  )
                }
                fullWidth
              />
              <TextField
                required
                label="مبلغ ریالی (داخل جمع نهایی)"
                value={a.amount}
                onChange={(e) =>
                  setExtras((v) =>
                    v.map((x, i) =>
                      i === index
                        ? { ...x, amount: doorCanonicalNumber(e.target.value) }
                        : x,
                    ),
                  )
                }
                fullWidth
              />
              <Button
                onClick={() =>
                  setExtras((v) => v.filter((_, i) => i !== index))
                }
              >
                حذف
              </Button>
            </Stack>
          ))}
          <Button
            onClick={() => setExtras((v) => [...v, { title: "", amount: "" }])}
          >
            افزودن جزئیات هزینه جانبی
          </Button>
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
            <TextField
              select
              label="روش بیعانه"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              fullWidth
            >
              <MenuItem value="PERCENT">درصدی (واحد پایه)</MenuItem>
              <MenuItem value="FIXED">مبلغ ثابت ریالی</MenuItem>
            </TextField>
            <TextField
              required
              label={
                kind === "PERCENT" ? "درصد؛ ۱۰۰ = یک درصد" : "مبلغ ثابت ریالی"
              }
              value={value}
              onChange={(e) => setValue(doorCanonicalNumber(e.target.value))}
              fullWidth
            />
            <TextField
              required
              label="حداقل بیعانه ریالی"
              value={minimum}
              onChange={(e) => setMinimum(doorCanonicalNumber(e.target.value))}
              fullWidth
            />
          </Stack>
          <TextField
            required
            label="دلیل تأیید یا اصلاح و جزئیات فنی"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={3}
          />
          <Button type="submit" variant="contained">
            صدور نسخه قطعی جدید پیش‌فاکتور
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}
function RequirementEditor({
  requirement: r,
  order,
  canStock,
  command,
}: {
  requirement: DoorOrderView["requirements"][number];
  order: DoorOrderView;
  canStock: boolean;
  command: (path: string, input: unknown) => Promise<boolean>;
}) {
  const [warehouse, setWarehouse] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expiry, setExpiry] = useState("");
  const [reason, setReason] = useState("");
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [locations, setLocations] = useState<
    { id: string; code: string; name: string | null }[]
  >([]);
  const [error, setError] = useState("");
  async function loadWarehouses() {
    try {
      const result = await listWarehouses({
        isActive: true,
        limit: 100,
        offset: 0,
      });
      setWarehouses(result.items);
    } catch (e) {
      setError(doorAdminError(e));
    }
  }
  async function loadLocations(id: string) {
    setWarehouse(id);
    setLocation("");
    try {
      const result = await listLocations(id, {
        isActive: true,
        limit: 100,
        offset: 0,
      });
      setLocations(result.items);
    } catch (e) {
      setError(doorAdminError(e));
    }
  }
  const root = `/orders/${order.id}/materials/${r.id}`;
  return (
    <Box sx={{ py: 3, borderBottom: "1px solid", borderColor: "divider" }}>
      <Typography fontWeight={800}>{r.snapshot.title}</Typography>
      <Typography variant="body2">
        مقدار محاسباتی: {r.snapshot.quantityNumerator}/
        {r.snapshot.quantityDenominator} {r.snapshot.unit} · واحد پایه واقعی:{" "}
        {r.snapshot.stockUnit ?? "بدون اتصال انبار"}
      </Typography>
      <Typography variant="body2">
        وضعیت رزرو: {r.reservationStatus ?? "ثبت نشده"} · مقدار واقعی:{" "}
        {r.actualStockQuantity ?? "تعیین نشده"} · مصرف:{" "}
        {r.consumedAt ? "ثبت شده" : "ثبت نشده"}
      </Typography>
      {!r.variantId ? (
        <Typography variant="caption">
          این تعرفه به SKU فیزیکی متصل نیست.
        </Typography>
      ) : (
        canStock &&
        !r.consumedAt && (
          <Box component="fieldset" sx={{ border: 0, p: 0, mt: 2 }}>
            <Stack gap={2}>
              <TextField
                required
                label="دلیل برنامه برش / مصرف واقعی"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {r.reservationStatus === "ACTIVE" ? (
                <Stack direction="row" gap={2}>
                  <Button
                    disabled={
                      !reason.trim() || order.status !== "IN_PRODUCTION"
                    }
                    onClick={() =>
                      void command(`${root}/consume`, {
                        expectedVersion: order.version,
                        reason,
                        status: order.status,
                      })
                    }
                  >
                    ثبت مصرف واقعی این رزرو
                  </Button>
                  <Button
                    disabled={!reason.trim()}
                    onClick={() =>
                      void command(`${root}/release`, {
                        expectedVersion: order.version,
                        reason,
                        status: order.status,
                      })
                    }
                  >
                    آزادسازی رزرو
                  </Button>
                </Stack>
              ) : (
                <>
                  <Button onClick={() => void loadWarehouses()}>
                    انتخاب محل موجودی واقعی
                  </Button>
                  <Stack direction={{ xs: "column", md: "row" }} gap={2}>
                    <TextField
                      select
                      label="انبار"
                      value={warehouse}
                      onChange={(e) => void loadLocations(e.target.value)}
                      fullWidth
                    >
                      {warehouses.map((w) => (
                        <MenuItem key={w.id} value={w.id}>
                          {w.name}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="محل انبار"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      fullWidth
                    >
                      {locations.map((l) => (
                        <MenuItem key={l.id} value={l.id}>
                          {l.name ?? l.code}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      required
                      label="مقدار واقعی بر اساس واحد پایه SKU"
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(doorCanonicalNumber(e.target.value))
                      }
                      fullWidth
                    />
                  </Stack>
                  <TextField
                    required
                    label="انقضای رزرو"
                    type="datetime-local"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <Button
                    disabled={
                      !reason.trim() ||
                      !warehouse ||
                      !location ||
                      !quantity ||
                      !expiry ||
                      !order.technicalApproved
                    }
                    onClick={() =>
                      void command(`${root}/reserve`, {
                        expectedVersion: order.version,
                        warehouseId: warehouse,
                        locationId: location,
                        actualStockQuantity: Number(quantity),
                        expiresAt: new Date(expiry).toISOString(),
                        reason,
                      })
                    }
                  >
                    رزرو با مقدار واقعی تأییدشده
                  </Button>
                </>
              )}
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </Box>
        )
      )}
    </Box>
  );
}

function DoorInvoiceBridge({ order }: { order: DoorOrderView }) {
  const [addresses, setAddresses] = useState<
    { id: string; label: string; city: string; addressLine: string }[]
  >([]);
  const [addressId, setAddressId] = useState("");
  const [error, setError] = useState("");
  const [draftId, setDraftId] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{
    key: string;
    version: number;
    addressId: string;
  } | null>(null);
  async function load() {
    try {
      const result = await doorAdmin<{ items: typeof addresses }>(
        `/orders/${order.id}/invoice-addresses`,
      );
      setAddresses(result.items);
      if (result.items.length === 0)
        setError(
          "نشانی صورتحساب مشتری ثبت نشده است؛ ابتدا دفتر نشانی مشتری را تکمیل کنید.",
        );
    } catch (e) {
      setError(doorAdminError(e));
    }
  }
  async function prepare() {
    if (busy) return;
    setBusy(true);
    setError("");
    pending.current ??= { key: doorKey(), version: order.version, addressId };
    const cmd = pending.current;
    try {
      const result = await doorAdmin<{ draftId: string }>(
        `/orders/${order.id}/invoice-source`,
        "POST",
        { expectedVersion: cmd.version, addressId: cmd.addressId },
        cmd.key,
      );
      setDraftId(result.draftId);
      pending.current = null;
    } catch (e) {
      setError(doorAdminError(e));
      if (e instanceof ApiClientError && e.statusCode < 500)
        pending.current = null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper sx={{ p: 3 }}>
      <Stack gap={2}>
        <Typography variant="h6">فاکتور رسمی فروشگاه</Typography>
        <Typography variant="body2">
          نسخه قطعی پذیرفته‌شده به‌عنوان خدمت ساخت وارد پیش‌فاکتور موجود فروشگاه
          می‌شود. صدور شماره، انتشار و PDF از همان سامانه فاکتور انجام می‌شود.
          سیاست مالیات باید با مبلغ قطعی سازگار باشد.
        </Typography>
        <Button
          disabled={busy || !!pending.current}
          onClick={() => void load()}
        >
          دریافت نشانی‌های صورتحساب این مشتری
        </Button>
        <TextField
          select
          label="نشانی صورتحساب معتبر"
          value={addressId}
          disabled={busy || !!pending.current}
          onChange={(e) => setAddressId(e.target.value)}
        >
          {addresses.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.label} — {a.city} — {a.addressLine}
            </MenuItem>
          ))}
        </TextField>
        <Button
          disabled={
            busy ||
            !addressId ||
            !order.quote.approved ||
            order.customerAcceptedQuoteVersion !== order.quote.version
          }
          onClick={() => void prepare()}
        >
          {pending.current
            ? "تلاش دوباره با همان درخواست"
            : "ایجاد پیش‌فاکتور در سامانه فاکتور موجود"}
        </Button>
        {draftId && (
          <Button
            component={Link}
            href={`/invoices/${encodeURIComponent(draftId)}`}
          >
            بررسی و صدور فاکتور
          </Button>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Paper>
  );
}
