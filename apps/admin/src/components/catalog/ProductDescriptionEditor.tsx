'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { RefreshCw } from 'lucide-react';
import type { ProductDetail } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError, ApiNetworkError } from '@/lib/api/client';
import {
  createIdempotencyKey,
  getProduct,
  updateProductDescription,
} from '@/lib/catalog/catalog-api';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { useProductMediaPicker } from '@/components/editor/ProductMediaPickerDialog';

export type DescriptionSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type ProductDescriptionEditorProps = {
  productId: string;
  description: string | null;
  version: number;
  canWrite: boolean;
  onServerProduct: (product: ProductDetail) => void;
};

export function ProductDescriptionPreview({ description }: { description: string | null }) {
  if (!description) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }
  return <Box dangerouslySetInnerHTML={{ __html: description }} />;
}

export function ProductDescriptionEditor({
  productId,
  description,
  version,
  canWrite,
  onServerProduct,
}: ProductDescriptionEditorProps) {
  const [draft, setDraft] = useState(description ?? '');
  const [savedContent, setSavedContent] = useState(description ?? '');
  const [status, setStatus] = useState<DescriptionSaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const { handle: mediaPicker, host: mediaPickerHost } = useProductMediaPicker(productId);
  const versionRef = useRef(version);

  const dirty = draft !== savedContent;

  const applyServerContent = useCallback(
    (nextDescription: string | null, nextVersion: number, nextStatus: DescriptionSaveStatus) => {
      const content = nextDescription ?? '';
      setDraft(content);
      setSavedContent(content);
      versionRef.current = nextVersion;
      setIdempotencyKey(null);
      setErrorMessage(null);
      setStale(false);
      setStatus(nextStatus);
    },
    [],
  );

  useEffect(() => {
    if (version === versionRef.current) return;
    applyServerContent(description, version, 'idle');
  }, [description, version, applyServerContent]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const refreshFromServer = useCallback(async () => {
    setReloading(true);
    try {
      const data = await getProduct(productId);
      applyServerContent(
        data.product.description,
        data.product.version ?? versionRef.current,
        'idle',
      );
      onServerProduct(data.product);
    } catch (err) {
      setStale(true);
      setErrorMessage(
        err instanceof Error ? err.message : 'بازیابی نسخهٔ تازهٔ محصول ناموفق بود.',
      );
    } finally {
      setReloading(false);
    }
  }, [applyServerContent, onServerProduct, productId]);

  const save = useCallback(() => {
    if (!canWrite || status === 'saving' || reloading || !dirty) return;
    const content = draft.trim() ? draft : null;
    const key = idempotencyKey ?? createIdempotencyKey('product-description');
    if (idempotencyKey !== key) setIdempotencyKey(key);
    setStatus('saving');
    setErrorMessage(null);
    setStale(false);
    updateProductDescription(
      productId,
      { description: content, expectedVersion: versionRef.current },
      key,
    )
      .then(({ product }) => {
        applyServerContent(
          product.description,
          product.version ?? versionRef.current + 1,
          'saved',
        );
        onServerProduct(product);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiClientError && err.statusCode === 409) {
          setIdempotencyKey(null);
          setStale(true);
          setStatus('error');
          setErrorMessage(
            err.code === 'STALE_VERSION'
              ? 'نسخهٔ محصول تغییر کرده است؛ محتوای شما ذخیره نشد تا بر روی نسخهٔ تازه بازنگری شود.'
              : 'درخواست ذخیره با درخواست پیشین همخوانی ندارد؛ محتوای شما ذخیره نشد.',
          );
          return;
        }
        if (err instanceof ApiClientError && err.statusCode === 403) {
          setIdempotencyKey(null);
          setStatus('error');
          setErrorMessage(
            'حساب شما مجوز `catalog.write` را ندارد؛ ذخیرهٔ توضیحات رد شد.',
          );
          return;
        }
        const retryable =
          err instanceof ApiNetworkError ||
          err instanceof ApiAbortError ||
          (err instanceof ApiClientError && err.statusCode >= 500);
        setStatus('error');
        setErrorMessage(
          err instanceof Error
            ? err.message
            : retryable
              ? 'برقراری ارتباط با سرویس ناموفق بود.'
              : 'ذخیرهٔ توضیحات رد شد.',
        );
        if (!retryable) setIdempotencyKey(null);
      });
  }, [
    applyServerContent,
    canWrite,
    dirty,
    idempotencyKey,
    onServerProduct,
    productId,
    reloading,
    status,
    draft,
  ]);

  const startEditing = useCallback(
    (next: string) => {
      setDraft(next);
      if (status === 'saved') setStatus('idle');
    },
    [status],
  );

  const clearContent = useCallback(() => {
    setDraft('');
    if (status === 'saved') setStatus('idle');
  }, [status]);

  if (!canWrite) {
    return <ProductDescriptionPreview description={description} />;
  }

  const saving = status === 'saving';

  return (
    <Stack spacing={2}>
      {stale ? (
        <Alert
          severity="warning"
          data-testid="description-stale"
          action={
            <Button
              size="small"
              data-testid="description-reload"
              onClick={() => void refreshFromServer()}
              startIcon={<RefreshCw size={14} />}
            >
              بارگذاری نسخهٔ تازه
            </Button>
          }
        >
          {errorMessage ?? 'نسخهٔ محصول بهروز نیست.'}
        </Alert>
      ) : status === 'error' ? (
        <Alert
          severity="error"
          data-testid="description-error"
          action={
            idempotencyKey ? (
              <Button size="small" data-testid="description-retry" onClick={save}>
                تلاش دوباره
              </Button>
            ) : undefined
          }
        >
          {errorMessage}
        </Alert>
      ) : null}
      {dirty ? (
        <Alert severity="info" data-testid="description-unsaved">
          تغییرات ذخیرهنشده دارید؛ پیش از ترک صفحه ذخیره کنید.
        </Alert>
      ) : null}
      <RichTextEditor
        value={draft}
        onChange={startEditing}
        placeholder="توضیحات محصول را بنویسید… (تصویر را از دکمهٔ Insert image انتخاب کنید)"
        height={280}
        ariaLabel="ویرایشگر توضیحات محصول"
        disabled={saving || reloading}
        mediaPicker={mediaPicker}
      />
      {mediaPickerHost}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            onClick={save}
            disabled={saving || reloading || !dirty}
            startIcon={saving ? <CircularProgress size={14} /> : undefined}
            data-testid="description-save"
          >
            {saving ? 'در حال ذخیره…' : 'ذخیرهٔ توضیحات'}
          </Button>
          <Button
            color="inherit"
            onClick={clearContent}
            disabled={saving || reloading || !draft}
            data-testid="description-clear"
          >
            پاک کردن متن
          </Button>
        </Stack>
        {status === 'saved' && !dirty ? (
          <Chip label="ذخیره شد" color="success" size="small" data-testid="description-saved" />
        ) : null}
      </Box>
    </Stack>
  );
}