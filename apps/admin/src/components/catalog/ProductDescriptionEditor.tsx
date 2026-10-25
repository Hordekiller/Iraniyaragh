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
import type { RichTextEditorHandle } from '@/components/editor/RichTextEditor';
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
  const editorRef = useRef<RichTextEditorHandle>(null);
  const draftRef = useRef(draft);
  const savingRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const pendingSaveRef = useRef<{
    draft: string;
    description: string | null;
    expectedVersion: number;
    key: string;
  } | null>(null);

  const dirty = draft !== savedContent;

  useEffect(() => {
    requestGenerationRef.current += 1;
    return () => { requestGenerationRef.current += 1; };
  }, [productId]);

  const applyServerContent = useCallback(
    (nextDescription: string | null, nextVersion: number, nextStatus: DescriptionSaveStatus) => {
      const content = nextDescription ?? '';
      draftRef.current = content;
      setDraft(content);
      setSavedContent(content);
      versionRef.current = nextVersion;
      setIdempotencyKey(null);
      pendingSaveRef.current = null;
      setErrorMessage(null);
      setStale(false);
      setStatus(nextStatus);
    },
    [],
  );

  useEffect(() => {
    if (version <= versionRef.current) return;
    if (dirty || savingRef.current) {
      setStale(true);
      setErrorMessage('نسخهٔ محصول تغییر کرده است؛ نوشتهٔ شما حفظ شده است. پیش از ثبت، نسخهٔ تازه را دریافت و بازبینی کنید.');
      return;
    }
    applyServerContent(description, version, 'idle');
  }, [description, version, applyServerContent, dirty]);

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
    if (savingRef.current || reloading) return;
    const generation = requestGenerationRef.current;
    setReloading(true);
    try {
      const data = await getProduct(productId);
      if (generation !== requestGenerationRef.current) return;
      applyServerContent(
        data.product.description,
        data.product.version ?? versionRef.current,
        'idle',
      );
      onServerProduct(data.product);
    } catch (err) {
      if (generation !== requestGenerationRef.current) return;
      setStale(true);
      setErrorMessage(
        err instanceof Error ? err.message : 'بازیابی نسخهٔ تازهٔ محصول ناموفق بود.',
      );
    } finally {
      if (generation === requestGenerationRef.current) setReloading(false);
    }
  }, [applyServerContent, onServerProduct, productId, reloading]);

  const save = useCallback(() => {
    if (!canWrite || savingRef.current || reloading || stale) return;
    // React's last render may precede Jodit's throttled change callback.
    // Snapshot the editor itself before disabling it or issuing the command.
    const currentDraft = editorRef.current?.getValue() ?? draftRef.current;
    if (currentDraft === savedContent && !pendingSaveRef.current) return;
    draftRef.current = currentDraft;
    setDraft(currentDraft);
    // Retrying an uncertain request must replay its exact original payload.
    // A changed draft is retained separately until that outcome is known.
    const command = pendingSaveRef.current ?? {
      draft: currentDraft,
      description: currentDraft.trim() ? currentDraft : null,
      expectedVersion: versionRef.current,
      key: createIdempotencyKey('product-description'),
    };
    pendingSaveRef.current = command;
    const key = command.key;
    const generation = requestGenerationRef.current;
    if (idempotencyKey !== key) setIdempotencyKey(key);
    savingRef.current = true;
    setStatus('saving');
    setErrorMessage(null);
    setStale(false);
    updateProductDescription(
      productId,
      { description: command.description, expectedVersion: command.expectedVersion },
      key,
    )
      .then(({ product }) => {
        if (generation !== requestGenerationRef.current) return;
        const latestDraft = editorRef.current?.getValue() ?? draftRef.current;
        const editedSinceSubmit = latestDraft !== command.draft;
        applyServerContent(
          product.description,
          product.version ?? versionRef.current + 1,
          editedSinceSubmit ? 'idle' : 'saved',
        );
        if (editedSinceSubmit) {
          draftRef.current = latestDraft;
          setDraft(latestDraft);
        }
        onServerProduct(product);
      })
      .catch((err: unknown) => {
        if (generation !== requestGenerationRef.current) return;
        if (err instanceof ApiClientError && err.statusCode === 409) {
          pendingSaveRef.current = null;
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
          pendingSaveRef.current = null;
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
        if (!retryable) {
          pendingSaveRef.current = null;
          setIdempotencyKey(null);
        }
      })
      .finally(() => {
        if (generation === requestGenerationRef.current) savingRef.current = false;
      });
  }, [
    applyServerContent,
    canWrite,
    idempotencyKey,
    onServerProduct,
    productId,
    reloading,
    savedContent,
    stale,
  ]);

  const startEditing = useCallback(
    (next: string) => {
      draftRef.current = next;
      setDraft(next);
      if (status === 'saved') setStatus('idle');
    },
    [status],
  );

  const clearContent = useCallback(() => {
    draftRef.current = '';
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
              disabled={saving || reloading}
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
        ref={editorRef}
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
            disabled={saving || reloading || stale || !dirty}
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
