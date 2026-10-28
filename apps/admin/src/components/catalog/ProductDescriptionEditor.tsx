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
import { PRODUCT_DESCRIPTION_HTML_LIMIT, readProductDescriptionDraft, writeProductDescriptionDraft, type PendingDescriptionSave, type ProductDescriptionDraft } from '@/lib/catalog/product-description-draft';

export type DescriptionSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type ProductDescriptionEditorProps = {
  productId: string;
  description: string | null;
  version: number;
  canWrite: boolean;
  draftOwnerId?: string;
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
  draftOwnerId,
  onServerProduct,
}: ProductDescriptionEditorProps) {
  const [draft, setDraft] = useState(description ?? '');
  const [savedContent, setSavedContent] = useState(description ?? '');
  const [status, setStatus] = useState<DescriptionSaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<ProductDescriptionDraft | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [reviewServerContent, setReviewServerContent] = useState(false);
  const { handle: mediaPicker, host: mediaPickerHost } = useProductMediaPicker(productId);
  const versionRef = useRef(version);
  const latestKnownVersionRef = useRef(version);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const draftRef = useRef(draft);
  const savedContentRef = useRef(savedContent);
  const savingRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const pendingSaveRef = useRef<PendingDescriptionSave | null>(null);

  const dirty = draft !== savedContent;
  const overLimit = draft.length > PRODUCT_DESCRIPTION_HTML_LIMIT;

  const persistDraft = useCallback((content: string, pending = pendingSaveRef.current) => {
    if (!draftOwnerId) return;
    const snapshot: ProductDescriptionDraft | null = content === savedContentRef.current && !pending ? null : {
      schema: 1, productId, baseVersion: versionRef.current, draft: content, pending,
    };
    setStorageWarning(!writeProductDescriptionDraft(draftOwnerId, productId, snapshot));
  }, [draftOwnerId, productId]);

  useEffect(() => {
    if (!draftOwnerId || !canWrite) return;
    const snapshot = readProductDescriptionDraft(draftOwnerId, productId);
    if (snapshot && (snapshot.draft !== savedContentRef.current || snapshot.pending)) setRecovery(snapshot);
    else writeProductDescriptionDraft(draftOwnerId, productId, null);
  }, [draftOwnerId, productId, canWrite]);

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
      savedContentRef.current = content;
      versionRef.current = nextVersion;
      latestKnownVersionRef.current = Math.max(latestKnownVersionRef.current, nextVersion);
      setIdempotencyKey(null);
      pendingSaveRef.current = null;
      setErrorMessage(null);
      setStale(false);
      setStatus(nextStatus);
    },
    [],
  );

  useEffect(() => {
    latestKnownVersionRef.current = Math.max(latestKnownVersionRef.current, version);
    if (version <= versionRef.current) return;
    if (dirty || savingRef.current) {
      setStale(true);
      setErrorMessage('نسخهٔ محصول تغییر کرده است؛ نوشتهٔ شما حفظ شده است. پیش از ثبت، نسخهٔ تازه را دریافت و بازبینی کنید.');
      return;
    }
    applyServerContent(description, version, 'idle');
  }, [description, version, applyServerContent, dirty]);

  useEffect(() => {
    if (!dirty && !pendingSaveRef.current) return;
    const warn = (event: BeforeUnloadEvent) => {
      persistDraft(editorRef.current?.getValue() ?? draftRef.current);
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, persistDraft]);

  const refreshFromServer = useCallback(async () => {
    if (savingRef.current || reloading || pendingSaveRef.current) return;
    const generation = requestGenerationRef.current;
    const localDraft = editorRef.current?.getValue() ?? draftRef.current;
    setReloading(true);
    try {
      const data = await getProduct(productId);
      if (generation !== requestGenerationRef.current) return;
      if (data.product.id !== productId || (data.product.version ?? -1) < versionRef.current) throw new Error('پاسخ بازیابی به‌روز نیست؛ نوشتهٔ شما حفظ شده است.');
      applyServerContent(
        data.product.description,
        data.product.version ?? versionRef.current,
        'idle',
      );
      // Reconcile the server base/version without discarding the operator's work.
      draftRef.current = localDraft;
      setDraft(localDraft);
      setReviewServerContent(localDraft !== (data.product.description ?? ''));
      persistDraft(localDraft, null);
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
  }, [applyServerContent, onServerProduct, persistDraft, productId, reloading]);

  const save = useCallback(() => {
    if (!canWrite || savingRef.current || reloading || (stale && !pendingSaveRef.current) || recovery) return;
    // React's last render may precede Jodit's throttled change callback.
    // Snapshot the editor itself before disabling it or issuing the command.
    const currentDraft = editorRef.current?.getValue() ?? draftRef.current;
    if (!pendingSaveRef.current && currentDraft.length > PRODUCT_DESCRIPTION_HTML_LIMIT) {
      draftRef.current = currentDraft; setDraft(currentDraft); persistDraft(currentDraft);
      setStatus('error'); setErrorMessage('توضیحات همراه با کد HTML باید حداکثر ۱۰۰٬۰۰۰ نویسه باشد؛ متن شما حفظ شده است.');
      return;
    }
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
    persistDraft(currentDraft, command);
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
        if (product.id !== productId || !Number.isSafeInteger(product.version) || (product.version ?? -1) <= command.expectedVersion) {
          throw new ApiNetworkError('تأیید معتبر ذخیره دریافت نشد؛ همان درخواست را دوباره پیگیری کنید.');
        }
        const latestDraft = editorRef.current?.getValue() ?? draftRef.current;
        if (product.version! < Math.max(versionRef.current, latestKnownVersionRef.current)) {
          pendingSaveRef.current = null; setIdempotencyKey(null); setStale(true); setStatus('error');
          setErrorMessage('درخواست قبلی ثبت شده، اما محصول دوباره تغییر کرده است. نوشتهٔ شما حفظ شده؛ نسخهٔ تازه را برای بازبینی دریافت کنید.');
          persistDraft(latestDraft, null);
          return;
        }
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
        setReviewServerContent(false);
        persistDraft(editedSinceSubmit ? latestDraft : product.description ?? '', null);
        onServerProduct(product);
      })
      .catch((err: unknown) => {
        if (generation !== requestGenerationRef.current) return;
        if (err instanceof ApiClientError && err.statusCode === 409) {
          const retryableConflict = err.code === 'CONFLICT';
          if (!retryableConflict) { pendingSaveRef.current = null; setIdempotencyKey(null); }
          persistDraft(editorRef.current?.getValue() ?? draftRef.current);
          if (retryableConflict) {
            setStatus('error'); setErrorMessage('ثبت هم‌زمان با عملیات دیگری برخورد کرد؛ همین درخواست را دوباره پیگیری کنید.');
            return;
          }
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
          persistDraft(editorRef.current?.getValue() ?? draftRef.current, null);
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
          err instanceof ApiClientError && err.statusCode === 413
            ? 'حجم درخواست بیش از حد مجاز است؛ متن شما حفظ شده است. کدها یا قالب‌بندی اضافه را کم کنید.'
            : err instanceof ApiClientError && err.code === 'DESCRIPTION_MEDIA_INVALID'
              ? 'یکی از تصاویر به این محصول تعلق ندارد یا آماده نیست؛ تصویر را از کتابخانهٔ همین محصول انتخاب کنید. متن شما حفظ شده است.'
            : err instanceof Error
            ? err.message
            : retryable
              ? 'برقراری ارتباط با سرویس ناموفق بود.'
              : 'ذخیرهٔ توضیحات رد شد.',
        );
        if (!retryable) {
          pendingSaveRef.current = null;
          setIdempotencyKey(null);
          persistDraft(editorRef.current?.getValue() ?? draftRef.current, null);
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
    persistDraft,
    productId,
    reloading,
    savedContent,
    stale,
    recovery,
  ]);

  const startEditing = useCallback(
    (next: string) => {
      draftRef.current = next;
      setDraft(next);
      persistDraft(next);
      if (status === 'saved') setStatus('idle');
    },
    [status, persistDraft],
  );

  const clearContent = useCallback(() => {
    draftRef.current = '';
    setDraft('');
    persistDraft('');
    if (status === 'saved') setStatus('idle');
  }, [status, persistDraft]);

  if (!canWrite) {
    return <ProductDescriptionPreview description={description} />;
  }

  const saving = status === 'saving';

  return (
    <Stack spacing={2}>
      {recovery ? <Alert severity="warning" data-testid="description-recovery" action={<Stack direction="row" spacing={1}>
        <Button size="small" onClick={() => {
          draftRef.current = recovery.draft; setDraft(recovery.draft); pendingSaveRef.current = recovery.pending;
          setIdempotencyKey(recovery.pending?.key ?? null); setRecovery(null);
          setReviewServerContent(recovery.draft !== savedContentRef.current);
          if (recovery.pending) { setStatus('error'); setErrorMessage('نتیجهٔ ثبت پیش از بازخوانی صفحه نامشخص بود؛ همان درخواست را پیگیری کنید.'); }
        }}>بازیابی نوشتهٔ من</Button>
        <Button size="small" onClick={() => { setRecovery(null); persistDraft(savedContentRef.current, null); }}>کنار گذاشتن پیش‌نویس</Button>
      </Stack>}>پیش‌نویس ذخیره‌نشدهٔ این محصول در همین برگه پیدا شد. هنوز روی سرور ثبت‌شده محسوب نمی‌شود.</Alert> : null}
      {storageWarning ? <Alert severity="warning">ذخیرهٔ پیش‌نویس در مرورگر ممکن نشد؛ پیش از بازخوانی یا بستن صفحه از متن خود کپی بگیرید.</Alert> : null}
      {reviewServerContent ? <Alert severity="info" data-testid="description-server-review">
        نسخهٔ ذخیره‌شده دریافت شد و نوشتهٔ شما حفظ شده است. پیش از ثبت، آن را با نسخهٔ سرور مقایسه کنید.
        <Box component="details" sx={{ mt: 1 }}><Typography component="summary">نمایش متن ذخیره‌شدهٔ سرور</Typography><ProductDescriptionPreview description={savedContent} /></Box>
      </Alert> : null}
      {overLimit ? <Alert severity="error">توضیحات همراه با کد HTML از سقف ۱۰۰٬۰۰۰ نویسه بیشتر است؛ برای ثبت، متن یا قالب‌بندی اضافه را کم کنید.</Alert> : null}
      {stale ? (
        <Alert
          severity="warning"
          data-testid="description-stale"
          action={
            <Stack direction="row" spacing={1}>
            {idempotencyKey ? <Button size="small" disabled={saving || reloading} data-testid="description-retry" onClick={save}>پیگیری درخواست قبلی</Button> : null}
            <Button
              size="small"
              data-testid="description-reload"
              disabled={saving || reloading || Boolean(idempotencyKey)}
              onClick={() => void refreshFromServer()}
              startIcon={<RefreshCw size={14} />}
            >
              بارگذاری نسخهٔ تازه
            </Button>
            </Stack>
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
          تغییرات ذخیره‌نشده دارید؛ پیش از ترک صفحه ذخیره کنید.
        </Alert>
      ) : null}
      <RichTextEditor
        ref={editorRef}
        value={draft}
        onChange={startEditing}
        placeholder="توضیحات محصول را بنویسید… (تصویر را از دکمهٔ Insert image انتخاب کنید)"
        height={280}
        ariaLabel="ویرایشگر توضیحات محصول"
        disabled={saving || reloading || Boolean(recovery)}
        mediaPicker={mediaPicker}
      />
      {mediaPickerHost}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button
            variant="contained"
            onClick={save}
            disabled={saving || reloading || stale || Boolean(recovery) || overLimit || !dirty}
            startIcon={saving ? <CircularProgress size={14} /> : undefined}
            data-testid="description-save"
          >
            {saving ? 'در حال ذخیره…' : 'ذخیرهٔ توضیحات'}
          </Button>
          <Button
            color="inherit"
            onClick={clearContent}
            disabled={saving || reloading || Boolean(recovery) || !draft}
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
