'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ImageList,
  ImageListItem,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { ImageOff } from 'lucide-react';
import { listProductMediaPicker } from '@/lib/catalog/media-api';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  createMediaPickerHandle,
  type MediaPickerHandle,
  type MediaPickerItem,
  type MediaPickerRequest,
} from '@/lib/editor/media-picker';

export type ProductMediaPickerDialogProps = {
  open: boolean;
  productId: string;
  onInsert: (item: MediaPickerItem) => void;
  onCancel: () => void;
};

export function ProductMediaPickerDialog({
  open,
  productId,
  onInsert,
  onCancel,
}: ProductMediaPickerDialogProps) {
  const [items, setItems] = useState<MediaPickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listProductMediaPicker(productId, controller.signal)
      .then((fetched) => setItems(fetched))
      .catch((fetchError: unknown) => {
        if (fetchError instanceof ApiAbortError) return;
        if (fetchError instanceof ApiClientError) {
          if (fetchError.statusCode === 403) {
            setError(
              'حساب شما برای مشاهدهٔ رسانه‌های این کالا مجوز `catalog.media.read` را ندارد.',
            );
            return;
          }
          if (fetchError.statusCode === 404) {
            setError('کالا پیدا نشد.');
            return;
          }
        }
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'بارگیری فهرست تصاویر ناموفق بود.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, productId, reloadKey]);

  const retry = () => setReloadKey((current) => current + 1);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      fullWidth
      maxWidth="md"
      scroll="body"
      aria-labelledby="product-media-picker-title"
      data-testid="product-media-picker-dialog"
    >
      <DialogTitle id="product-media-picker-title">
        انتخاب تصویر از کتابخانهٔ محصول
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box data-testid="media-picker-loading" sx={{ py: 4 }}>
            <LinearProgress sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              در حال بارگیری تصاویر تأییدشده…
            </Typography>
          </Box>
        ) : error ? (
          <Box data-testid="media-picker-error" sx={{ py: 2 }}>
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
            <Button variant="outlined" size="small" onClick={retry}>
              تلاش دوباره
            </Button>
          </Box>
        ) : items.length === 0 ? (
          <Box data-testid="media-picker-empty">
            <EmptyState
              icon={<ImageOff size={28} />}
              title="تصویری برای انتخاب وجود ندارد"
              description="تصویر تأییدشده‌ای برای این کالا ثبت نشده است؛ ابتدا از مدیریت رسانه، تصویر را بارگذاری و تأیید کنید."
            />
          </Box>
        ) : (
          <ImageList cols={3} gap={12} data-testid="media-picker-grid">
            {items.map((item) => (
              <ImageListItem key={item.id}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => onInsert(item)}
                  aria-label={item.alt || `انتخاب تصویر ${item.id}`}
                  data-testid="media-picker-option"
                  sx={{
                    p: 0,
                    textAlign: 'start',
                    overflow: 'hidden',
                    color: 'text.primary',
                  }}
                >
                  <Box
                    component="img"
                    src={item.url}
                    alt={item.alt}
                    loading="lazy"
                    sx={{
                      display: 'block',
                      width: '100%',
                      aspectRatio: `${item.width} / ${item.height}`,
                      objectFit: 'cover',
                    }}
                  />
                  <Stack spacing={0.5} sx={{ p: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {item.alt || '—'}
                    </Typography>
                    {item.caption ? (
                      <Typography variant="caption" color="text.secondary">
                        {item.caption}
                      </Typography>
                    ) : null}
                    <Typography variant="caption" color="text.disabled" dir="ltr">
                      {item.width} × {item.height}
                    </Typography>
                  </Stack>
                </Button>
              </ImageListItem>
            ))}
          </ImageList>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>انصراف</Button>
      </DialogActions>
    </Dialog>
  );
}

export type ProductMediaPickerController = {
  handle: MediaPickerHandle | undefined;
  host: ReactNode;
};

export function useProductMediaPicker(
  productId: string | undefined,
): ProductMediaPickerController {
  const [request, setRequest] = useState<MediaPickerRequest | null>(null);

  const open = useCallback((next: MediaPickerRequest) => setRequest(next), []);
  const handle = useMemo(
    () => (productId ? createMediaPickerHandle(productId, open) : undefined),
    [productId, open],
  );

  let host: ReactNode = null;
  if (productId) {
    host = (
      <ProductMediaPickerDialog
        open={request !== null}
        productId={productId}
        onInsert={(item) => {
          request?.onInsert(item);
          setRequest(null);
        }}
        onCancel={() => {
          request?.onCancel();
          setRequest(null);
        }}
      />
    );
  }

  return { handle, host };
}