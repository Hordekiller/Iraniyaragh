'use client';

import { useRef, useState } from 'react';
import { Alert, Button, Stack, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, CircularProgress } from '@mui/material';
import { Archive, MoreVertical, Rocket, Undo2 } from 'lucide-react';
import type { ProductListItem } from '@iranyaragh/contracts';
import { ApiClientError } from '@/lib/api/client';
import { changeProductStatus, createIdempotencyKey } from '@/lib/catalog/catalog-api';
import { useFeedback } from '@/components/ui/FeedbackProvider';

type StatusAction = {
  action: 'publish' | 'unpublish' | 'archive';
  label: string;
  icon: React.ReactNode;
};

type ProductStatusActionsProps = {
  product: ProductListItem;
  inline?: boolean;
  /** Called after a successful command so the parent can refresh the list. */
  onChanged: () => void;
};

const STATUS_LABEL: Record<StatusAction['action'], string> = {
  publish: 'منتشرشده',
  unpublish: 'پیش‌نویس',
  archive: 'بایگانی‌شده',
};

export function ProductStatusActions({ product, onChanged, inline = false }: ProductStatusActionsProps) {
  const feedback = useFeedback();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idempotencyKeys = useRef<Partial<Record<StatusAction['action'], string>>>({});
  const open = Boolean(anchor);

  const options: StatusAction[] = [
    ...(product.status !== 'PUBLISHED'
      ? [{ action: 'publish' as const, label: 'انتشار', icon: <Rocket size={18} /> }]
      : []),
    ...(product.status === 'PUBLISHED'
      ? [{ action: 'unpublish' as const, label: 'افزودن به پیش‌نویس', icon: <Undo2 size={18} /> }]
      : []),
    ...(product.status !== 'ARCHIVED'
      ? [{ action: 'archive' as const, label: 'بایگانی', icon: <Archive size={18} /> }]
      : []),
  ];

  async function run(action: StatusAction['action']) {
    setAnchor(null);
    const label = STATUS_LABEL[action];
    setBusy(true);
    setErrorMessage(null);
    idempotencyKeys.current[action] ??= createIdempotencyKey(`catalog-status-${product.id}-${action}`);
    try {
      await changeProductStatus(product.id, action, idempotencyKeys.current[action]!);
      feedback.success(`وضعیت «${product.name}» به «${label}» تغییر کرد.`);
      onChanged();
      delete idempotencyKeys.current[action];
    } catch (error) {
      const message = error instanceof ApiClientError
        ? error.code === 'MEDIA_PRIMARY_REQUIRED' ? 'برای انتشار، در «مدیریت رسانه» یک تصویر اصلی بارگذاری کنید و منتظر وضعیت آماده بمانید.'
          : error.code === 'ATTRIBUTE_OPTION_INVALID' ? 'مقادیر ویژگی‌های اجباری را برای تمام SKUهای فعال ذخیره کنید.'
          : error.code === 'UNPROCESSABLE' ? 'برای انتشار، حداقل یک SKU فعال لازم است.' : error.message
        : 'تغییر وضعیت ناموفق بود؛ دوباره تلاش کنید.';
      setErrorMessage(message);
      feedback.error(message);
    } finally {
      setBusy(false);
    }
  }

  if (inline) return <Stack spacing={1}>
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {options.map(option => <Button key={option.action} size="small" variant={option.action === 'publish' ? 'contained' : 'outlined'} startIcon={option.icon} disabled={busy} onClick={() => void run(option.action)}>{busy ? 'در حال ثبت…' : option.label}</Button>)}
      {product.status === 'PUBLISHED' ? <Button component="a" href={`/product/${encodeURIComponent(product.slug)}`} target="_blank" rel="noopener noreferrer" size="small">مشاهده در فروشگاه</Button> : null}
    </Stack>
    {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
  </Stack>;

  return (
    <>
      {busy ? (
        <CircularProgress size={20} aria-label="در حال تغییر وضعیت" />
      ) : (
        <IconButton
          size="small"
          aria-label={`اقدامات ${product.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <MoreVertical size={18} />
        </IconButton>
      )}
      <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)}>
        {options.map((option) => (
          <MenuItem key={option.action} dense onClick={() => void run(option.action)}>
            <ListItemIcon>{option.icon}</ListItemIcon>
            <ListItemText>{option.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
