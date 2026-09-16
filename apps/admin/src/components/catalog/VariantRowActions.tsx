'use client';

import { useRef, useState } from 'react';
import {
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from '@mui/material';
import { Archive, Banknote, MoreVertical, Pencil, PowerOff, Rocket } from 'lucide-react';
import type { ProductVariant, VariantStatus } from '@iranyaragh/contracts';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import { ApiClientError } from '@/lib/api/client';
import { changeVariantStatus, createIdempotencyKey } from '@/lib/catalog/catalog-api';
import { variantStatusLabel } from '@/lib/catalog/catalog-labels';
import { VariantEditDialog } from './VariantEditDialog';
import { VariantPriceDialog } from './VariantPriceDialog';

type Props = {
  variant: ProductVariant;
  onChanged: () => void;
};

const STATUS_TARGETS: { status: VariantStatus; label: string; icon: React.ReactNode }[] = [
  { status: 'ACTIVE', label: 'فعال‌سازی', icon: <Rocket size={18} /> },
  { status: 'INACTIVE', label: 'غیرفعال‌سازی', icon: <PowerOff size={18} /> },
  { status: 'ARCHIVED', label: 'بایگانی', icon: <Archive size={18} /> },
];

export function VariantRowActions({ variant, onChanged }: Props) {
  const feedback = useFeedback();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState<false | VariantStatus>(false);
  const [mode, setMode] = useState<'edit' | 'price' | null>(null);
  const idempotencyKeys = useRef<Partial<Record<VariantStatus, string>>>({});
  const open = Boolean(anchor);

  const status: VariantStatus = variant.status ?? (variant.isActive ? 'ACTIVE' : 'INACTIVE');

  async function run(target: VariantStatus) {
    setAnchor(null);
    setBusy(target);
    idempotencyKeys.current[target] ??= createIdempotencyKey(`catalog-variant-status-${variant.id}-${target}`);
    try {
      await changeVariantStatus(
        variant.id,
        { status: target, expectedVersion: variant.version ?? 0 },
        idempotencyKeys.current[target]!,
      );
      feedback.success(`وضعیت «${variant.sku}» به «${variantStatusLabel(target)}» تغییر کرد.`);
      onChanged();
      delete idempotencyKeys.current[target];
    } catch (error) {
      feedback.error(error instanceof ApiClientError ? error.message : 'تغییر وضعیت تنوع ناموفق بود؛ دوباره تلاش کنید.');
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
          aria-label={`اقدامات ${variant.sku}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <MoreVertical size={18} />
        </IconButton>
      )}
      <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)}>
        <MenuItem
          dense
          onClick={() => {
            setAnchor(null);
            setMode('edit');
          }}
        >
          <ListItemIcon>
            <Pencil size={18} />
          </ListItemIcon>
          <ListItemText>ویرایش</ListItemText>
        </MenuItem>
        <MenuItem
          dense
          onClick={() => {
            setAnchor(null);
            setMode('price');
          }}
        >
          <ListItemIcon>
            <Banknote size={18} />
          </ListItemIcon>
          <ListItemText>قیمت و تاریخچه</ListItemText>
        </MenuItem>
        {STATUS_TARGETS.filter((target) => target.status !== status).map((target) => (
          <MenuItem key={target.status} dense onClick={() => void run(target.status)}>
            <ListItemIcon>{target.icon}</ListItemIcon>
            <ListItemText>{target.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
      {mode === 'edit' ? (
        <VariantEditDialog variant={variant} onSaved={onChanged} onClose={() => setMode(null)} />
      ) : null}
      {mode === 'price' ? (
        <VariantPriceDialog variant={variant} onSaved={onChanged} onClose={() => setMode(null)} />
      ) : null}
    </>
  );
}