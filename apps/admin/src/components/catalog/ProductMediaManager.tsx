"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ImageIcon,
  RefreshCw,
  Star,
  UploadCloud,
} from "lucide-react";
import type { AdminProductMedia, ProductDetail } from "@iranyaragh/contracts";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ApiAbortError, ApiClientError } from "@/lib/api/client";
import { getProduct } from "@/lib/catalog/catalog-api";
import {
  canReadCatalogMedia,
  canWriteCatalogMedia,
} from "@/lib/catalog/catalog-permissions";
import {
  archiveMedia,
  confirmMediaUpload,
  initiateMediaUpload,
  listProductMedia,
  reorderMedia,
  setPrimaryMedia,
  updateMediaMetadata,
  uploadMediaObject,
} from "@/lib/catalog/media-api";

const ACTIVE_PROCESSING = new Set(["PENDING_UPLOAD", "UPLOADED", "PROCESSING"]);
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024;

const stateLabel: Record<AdminProductMedia["state"], string> = {
  PENDING_UPLOAD: "در انتظار ارسال",
  UPLOADED: "در صف پردازش",
  PROCESSING: "در حال پردازش",
  READY: "آماده",
  FAILED: "ناموفق",
  ARCHIVED: "بایگانی‌شده",
};

function message(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : "عملیات رسانه ناموفق بود؛ دوباره تلاش کنید.";
}

export function ProductMediaManager({ productId }: { productId: string }) {
  const { user } = useAuth();
  const feedback = useFeedback();
  const canRead = canReadCatalogMedia(user);
  const canWrite = canWriteCatalogMedia(user);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollCountRef = useRef(0);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [items, setItems] = useState<AdminProductMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminProductMedia | null>(null);
  const [archiveCandidate, setArchiveCandidate] =
    useState<AdminProductMedia | null>(null);
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");

  const load = useCallback(
    async (signal?: AbortSignal, quiet = false) => {
      if (!canRead) return;
      if (!quiet) setLoading(true);
      try {
        const [productData, media] = await Promise.all([
          getProduct(productId, signal),
          listProductMedia(productId, signal),
        ]);
        setProduct(productData.product);
        setItems(media.filter((item) => item.state !== "ARCHIVED"));
        if (!quiet) setError(null);
      } catch (caught) {
        if (!(caught instanceof ApiAbortError)) setError(message(caught));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [canRead, productId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!items.some((item) => ACTIVE_PROCESSING.has(item.state))) {
      pollCountRef.current = 0;
      return;
    }
    const timer = window.setInterval(() => {
      pollCountRef.current += 1;
      if (pollCountRef.current >= 150) {
        window.clearInterval(timer);
        setError("پردازش تصویر بیش از حد انتظار طول کشید. وضعیت را تازه‌سازی کنید یا تصویر را بایگانی و دوباره ارسال کنید.");
        return;
      }
      void load(undefined, true);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [items, load]);

  async function upload(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file || !product?.version) return;
    if (!ALLOWED_TYPES.has(file.type))
      return setError("فقط تصویر JPEG، PNG یا WebP قابل ارسال است.");
    if (file.size > MAX_BYTES)
      return setError("حجم تصویر باید حداکثر ۲۰ مگابایت باشد.");
    if (items.length >= 12)
      return setError("حداکثر ۱۲ رسانه برای هر کالا مجاز است.");
    setBusyId("upload");
    setUploadProgress(0);
    setError(null);
    try {
      const intent = await initiateMediaUpload(productId, {
        kind: "IMAGE",
        role: items.some((item) => item.role === "PRIMARY")
          ? "GALLERY"
          : "PRIMARY",
        position: Math.max(-1, ...items.map(item => item.position)) + 1,
        originalFilename: file.name,
        declaredMime: file.type as "image/jpeg" | "image/png" | "image/webp",
        bytes: file.size,
        productVersion: product.version,
      });
      await uploadMediaObject(intent, file, setUploadProgress);
      const confirmed = await confirmMediaUpload(productId, intent.mediaId);
      setItems((current) =>
        [...current, confirmed].sort((a, b) => a.position - b.position),
      );
      feedback.success("تصویر ارسال شد و وارد صف پردازش شد.");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusyId(null);
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function saveOrder(ordered: AdminProductMedia[]) {
    if (!product?.version) return;
    setBusyId("order");
    try {
      const result = await reorderMedia(productId, {
        expectedProductVersion: product.version,
        items: ordered.map((item, position) => ({
          mediaId: item.id,
          expectedVersion: item.version,
          position,
        })),
      });
      setItems(result);
      setProduct((current) =>
        current ? { ...current, version: (current.version ?? 0) + 1 } : current,
      );
    } catch (caught) {
      setError(message(caught));
      await load(undefined, true);
    } finally {
      setBusyId(null);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (
      target < 0 ||
      target >= items.length ||
      items[index]?.role === "PRIMARY" ||
      items[target]?.role === "PRIMARY"
    )
      return;
    const ordered = [...items];
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    await saveOrder(ordered);
  }

  async function dropOn(targetId: string) {
    const sourceIndex = items.findIndex((item) => item.id === draggingId);
    const targetIndex = items.findIndex((item) => item.id === targetId);
    setDraggingId(null);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex)
      return;
    if (
      items[sourceIndex]?.role === "PRIMARY" ||
      items[targetIndex]?.role === "PRIMARY"
    )
      return;
    const ordered = [...items];
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved!);
    await saveOrder(ordered);
  }

  async function makePrimary(item: AdminProductMedia) {
    if (!product?.version) return;
    setBusyId(item.id);
    try {
      setItems(
        await setPrimaryMedia(productId, item.id, {
          expectedProductVersion: product.version,
          expectedVersion: item.version,
        }),
      );
      setProduct((current) =>
        current ? { ...current, version: (current.version ?? 0) + 1 } : current,
      );
      feedback.success("تصویر اصلی کالا تغییر کرد.");
    } catch (caught) {
      setError(message(caught));
      await load(undefined, true);
    } finally {
      setBusyId(null);
    }
  }

  async function archive(item: AdminProductMedia) {
    setBusyId(item.id);
    try {
      await archiveMedia(productId, item.id, item.version);
      setItems((current) =>
        current.filter((candidate) => candidate.id !== item.id),
      );
      setArchiveCandidate(null);
      feedback.success("رسانه بایگانی شد.");
    } catch (caught) {
      setError(message(caught));
      await load(undefined, true);
    } finally {
      setBusyId(null);
    }
  }

  async function saveMetadata() {
    if (!editing) return;
    setBusyId(editing.id);
    try {
      const updated = await updateMediaMetadata(productId, editing.id, {
        expectedVersion: editing.version,
        altText,
        caption,
      });
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditing(null);
      feedback.success("متن جایگزین و توضیح ذخیره شد.");
    } catch (caught) {
      setError(message(caught));
      await load(undefined, true);
    } finally {
      setBusyId(null);
    }
  }

  if (!canRead)
    return (
      <EmptyState
        icon={<ImageIcon />}
        title="دسترسی ندارید"
        description="مجوز مشاهدهٔ رسانه‌های کاتالوگ برای حساب شما فعال نیست."
      />
    );

  return (
    <>
      <PageHeader
        title={`رسانه‌های ${product?.name ?? "کالا"}`}
        eyebrow="کاتالوگ"
        description="تصاویر کالا را ارسال، مرتب و برای انتشار آماده کنید. فایل‌ها مستقیم به فضای ذخیره‌سازی خصوصی ارسال می‌شوند."
        breadcrumbs={[
          { label: "کالا و انبار" },
          { label: "کالا و SKU", href: "/catalog" },
          { label: "رسانه" },
        ]}
        actions={
          <Button
            component={Link}
            href="/catalog"
            startIcon={<ArrowRight size={18} />}
          >
            بازگشت
          </Button>
        }
      />
      <Stack spacing={3} sx={{ maxWidth: 960 }}>
        {error ? (
          <Alert
            severity="error"
            action={
              <IconButton aria-label="تلاش دوباره" onClick={() => void load()}>
                <RefreshCw size={18} />
              </IconButton>
            }
          >
            {error}
          </Alert>
        ) : null}
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Box
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (canWrite) void upload(event.dataTransfer.files);
                }}
                sx={{
                  border: "2px dashed",
                  borderColor: "divider",
                  borderRadius: 2,
                  p: { xs: 3, sm: 5 },
                  textAlign: "center",
                  bgcolor: "action.hover",
                }}
              >
                <UploadCloud size={34} aria-hidden />
                <Typography variant="h6" fontWeight={800}>
                  تصویر را اینجا رها کنید
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  JPEG، PNG یا WebP — حداکثر ۲۰ مگابایت
                </Typography>
                <input
                  ref={inputRef}
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    event.target.files && void upload(event.target.files)
                  }
                />
                <Button
                  sx={{ mt: 2 }}
                  variant="contained"
                  disabled={!canWrite || busyId === "upload"}
                  onClick={() => inputRef.current?.click()}
                >
                  انتخاب تصویر
                </Button>
              </Box>
              {uploadProgress !== null ? (
                <Box aria-live="polite">
                  <LinearProgress
                    variant="determinate"
                    value={uploadProgress}
                  />
                  <Typography variant="caption">
                    ارسال: {uploadProgress.toLocaleString("fa-IR")}٪
                  </Typography>
                </Box>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
        {loading ? (
          <Stack spacing={1}>
            {[1, 2, 3].map((key) => (
              <Skeleton key={key} height={96} variant="rounded" />
            ))}
          </Stack>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ImageIcon />}
            title="هنوز تصویری ثبت نشده"
            description="اولین تصویر آماده به‌صورت خودکار تصویر اصلی کالا می‌شود."
          />
        ) : (
          <Stack spacing={1.5}>
            {items.map((item, index) => (
              <Card
                key={item.id}
                variant="outlined"
                draggable={canWrite && item.role !== "PRIMARY"}
                onDragStart={() => setDraggingId(item.id)}
                onDragEnd={() => setDraggingId(null)}
                onDragOver={(event) => {
                  if (item.role !== "PRIMARY") event.preventDefault();
                }}
                onDrop={() => void dropOn(item.id)}
                sx={{ opacity: draggingId === item.id ? 0.55 : 1 }}
              >
                <CardContent>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    alignItems={{ sm: "center" }}
                  >
                    <Box
                      sx={{
                        width: 72,
                        height: 72,
                        borderRadius: 2,
                        bgcolor: "action.hover",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <ImageIcon aria-hidden />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Typography fontWeight={800} noWrap>
                          {item.originalFilename}
                        </Typography>
                        {item.role === "PRIMARY" ? (
                          <Chip
                            icon={<Star size={14} />}
                            label="تصویر اصلی"
                            color="primary"
                            size="small"
                          />
                        ) : null}
                        <StatusChip
                          label={stateLabel[item.state]}
                          tone={
                            item.state === "READY"
                              ? "success"
                              : item.state === "FAILED"
                                ? "error"
                                : "warning"
                          }
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {item.altText || "متن جایگزین ثبت نشده"} · جایگاه{" "}
                        {new Intl.NumberFormat("fa-IR").format(
                          item.position + 1,
                        )}
                      </Typography>
                      {ACTIVE_PROCESSING.has(item.state) ? (
                        <LinearProgress sx={{ mt: 1 }} />
                      ) : null}
                    </Box>
                    <Stack direction="row">
                      <IconButton
                        aria-label="انتقال به بالا"
                        disabled={
                          !canWrite ||
                          index === 0 ||
                          items[index - 1]?.role === "PRIMARY" ||
                          busyId === "order"
                        }
                        onClick={() => void move(index, -1)}
                      >
                        <ArrowUp size={18} />
                      </IconButton>
                      <IconButton
                        aria-label="انتقال به پایین"
                        disabled={
                          !canWrite ||
                          index === items.length - 1 ||
                          items[index + 1]?.role === "PRIMARY" ||
                          busyId === "order"
                        }
                        onClick={() => void move(index, 1)}
                      >
                        <ArrowDown size={18} />
                      </IconButton>
                      <IconButton
                        aria-label="تنظیم به‌عنوان تصویر اصلی"
                        disabled={
                          !canWrite ||
                          item.role === "PRIMARY" ||
                          item.state !== "READY" ||
                          busyId === item.id
                        }
                        onClick={() => void makePrimary(item)}
                      >
                        {busyId === item.id ? (
                          <CircularProgress size={18} />
                        ) : (
                          <Star size={18} />
                        )}
                      </IconButton>
                      <Button
                        size="small"
                        disabled={!canWrite}
                        onClick={() => {
                          setEditing(item);
                          setAltText(item.altText ?? "");
                          setCaption(item.caption ?? "");
                        }}
                      >
                        ویرایش متن
                      </Button>
                      <IconButton
                        aria-label="بایگانی رسانه"
                        color="error"
                        disabled={
                          !canWrite ||
                          busyId === item.id ||
                          (item.role === "PRIMARY" &&
                            product?.status === "PUBLISHED")
                        }
                        onClick={() => setArchiveCandidate(item)}
                      >
                        <Archive size={18} />
                      </IconButton>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>متادیتای تصویر</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="متن جایگزین"
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              inputProps={{ maxLength: 300 }}
              helperText={`${altText.length.toLocaleString("fa-IR")} از ۳۰۰`}
            />
            <TextField
              label="توضیح تصویر"
              multiline
              minRows={3}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              inputProps={{ maxLength: 500 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>انصراف</Button>
          <Button
            variant="contained"
            disabled={busyId === editing?.id}
            onClick={() => void saveMetadata()}
          >
            ذخیره
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmationDialog
        open={Boolean(archiveCandidate)}
        setOpen={(open) => {
          if (!open) setArchiveCandidate(null);
        }}
        type="archive"
        title="بایگانی رسانه"
        description="رسانه از گالری فعال کنار گذاشته می‌شود و پس از دورهٔ نگهداری پاک‌سازی خواهد شد."
        confirmLabel="بایگانی"
        loading={Boolean(archiveCandidate && busyId === archiveCandidate.id)}
        onConfirm={() =>
          archiveCandidate ? archive(archiveCandidate) : undefined
        }
      />
    </>
  );
}
