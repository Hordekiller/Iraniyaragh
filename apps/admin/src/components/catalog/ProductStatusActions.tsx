'use client';

import { useRef, useState } from 'react';
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText, CircularProgress } from '@mui/material';
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
  /** Called after a successful command so the parent can refresh the list. */
  onChanged: () => void;
};

const STATUS_LABEL: Record<StatusAction['action'], string> = {
  publish: 'منتشرشده',
  unpublish: 'پیش‌نویس',
  archive: 'بایگانی‌شده',
};

export function ProductStatusActions({ product, onChanged }: ProductStatusActionsProps) {
  const feedback = useFeedback();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
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
    idempotencyKeys.current[action] ??= createIdempotencyKey(`catalog-status-${product.id}-${action}`);
    try {
      await changeProductStatus(product.id, action, idempotencyKeys.current[action]!);
      feedback.success(`وضعیت «${product.name}» به «${label}» تغییر کرد.`);
      onChanged();
      delete idempotencyKeys.current[action];
    } catch (error) {
      feedback.error(
        error instanceof ApiClientError ? error.message : 'تغییر وضعیت ناموفق بود؛ دوباره تلاش کنید.',
      );
    } finally {
      setBusy(false);
    }
  }

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
