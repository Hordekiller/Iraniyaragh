'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import type { AdminCustomerAddress, AdminCustomerSummary, CustomerStatus } from '@iranyaragh/contracts';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { newCustomerCommandKey, replaceAddresses } from '@/lib/customers/customers-api';
import { customerFormError } from './CustomerDialog';

type Draft = {
  key: string;
  label: string;
  receiverName: string;
  mobile: string;
  provinceCode: string;
  city: string;
  addressLine: string;
  postalCode: string;
  isDefault: boolean;
};

type Props = {
  open: boolean;
  customer: AdminCustomerSummary & { addresses: AdminCustomerAddress[] };
  onClose: () => void;
  onSaved: () => void;
};

const POSTAL_PATTERN = /^\d{10}$/u;
const PROVINCE_PATTERN = /^[A-Z]{2,3}$/u;

function draftFrom(address: AdminCustomerAddress): Draft {
  return {
    key: address.id,
    label: address.label,
    receiverName: address.receiverName,
    mobile: address.mobile,
    provinceCode: address.provinceCode,
    city: address.city,
    addressLine: address.addressLine,
    postalCode: address.postalCode ?? '',
    isDefault: address.isDefault,
  };
}

function emptyDraft(): Draft {
  return {
    key: `new-${globalThis.crypto.randomUUID()}`,
    label: '',
    receiverName: '',
    mobile: '',
    provinceCode: '',
    city: '',
    addressLine: '',
    postalCode: '',
    isDefault: false,
  };
}

/**
 * The API replaces the whole set, so a submit with addresses must carry exactly
 * one default. Catching it here keeps the operator from round-tripping a 400.
 */
export function addressesValidationError(drafts: Draft[]): string | null {
  if (drafts.length === 0) return null;
  if (!drafts.some((draft) => draft.isDefault)) {
    return 'با بیش از یک نشانی، دقیقاً یک نشانی باید پیش‌فرض باشد.';
  }
  for (const [index, draft] of drafts.entries()) {
    const position = faIndex.format(index + 1);
    if (!draft.label.trim()) return `نشانی ${position}: برچسب الزامی است.`;
    if (!draft.receiverName.trim()) return `نشانی ${position}: نام گیرنده الزامی است.`;
    if (!PROVINCE_PATTERN.test(draft.provinceCode.trim().toUpperCase())) {
      return `نشانی ${position}: کد استان باید ۲ تا ۳ نویسهٔ انگلیسی بزرگ باشد (نمونه: THR).`;
    }
    if (!draft.city.trim()) return `نشانی ${position}: شهر الزامی است.`;
    if (!draft.addressLine.trim()) return `نشانی ${position}: نشانی الزامی است.`;
    if (draft.postalCode.trim() && !POSTAL_PATTERN.test(draft.postalCode.trim())) {
      return `نشانی ${position}: کد پستی باید ۱۰ رقم باشد.`;
    }
  }
  return null;
}

const faIndex = new Intl.NumberFormat('fa-IR');

export function CustomerAddressesDialog({ open, customer, onClose, onSaved }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [status, setStatus] = useState<CustomerStatus>(customer.status);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDrafts(customer.addresses.length > 0 ? customer.addresses.map(draftFrom) : [emptyDraft()]);
    setStatus(customer.status);
    setError(null);
  }, [open, customer]);

  const patch = (key: string, changes: Partial<Draft>) => {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...changes } : draft)),
    );
  };

  /** Picking a default clears the others, mirroring the single-default rule. */
  const setDefault = (key: string, checked: boolean) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.key === key
          ? { ...draft, isDefault: checked }
          : checked
            ? { ...draft, isDefault: false }
            : draft,
      ),
    );
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const validation = addressesValidationError(drafts);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await replaceAddresses(
        customer.id,
        {
          expectedVersion: customer.version,
          status,
          addresses: drafts.map((draft) => ({
            label: draft.label.trim(),
            receiverName: draft.receiverName.trim(),
            mobile: draft.mobile.trim(),
            provinceCode: draft.provinceCode.trim().toUpperCase(),
            city: draft.city.trim(),
            addressLine: draft.addressLine.trim(),
            postalCode: draft.postalCode.trim() || null,
            isDefault: draft.isDefault,
          })),
        },
        newCustomerCommandKey('addresses'),
      );
      onSaved();
      onClose();
    } catch (failure) {
      setError(
        failure instanceof ApiNetworkError || failure instanceof ApiClientError
          ? customerFormError(failure)
          : 'ذخیرهٔ نشانی‌ها ناموفق بود.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby="customer-addresses-title"
    >
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle id="customer-addresses-title">نشانی‌ها و وضعیت مشتری</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Alert severity="info">
              نشانی‌ها دادهٔ کمکی کارکنان هستند و سابقهٔ سفارش محسوب نمی‌شوند؛ هر ذخیره کل مجموعه را
              جایگزین می‌کند.
            </Alert>

            <TextField
              select
              label="وضعیت مشتری"
              value={status}
              disabled={submitting}
              onChange={(event) => setStatus(event.target.value as CustomerStatus)}
              helperText="غیرفعال‌سازی، سابقهٔ سفارش و یادداشت‌ها را حفظ می‌کند و مشتری را از فهرست‌های عملیاتی حذف می‌کند."
            >
              <MenuItem value="ACTIVE">فعال</MenuItem>
              <MenuItem value="INACTIVE">غیرفعال</MenuItem>
            </TextField>

            {drafts.map((draft, index) => (
              <Box
                key={draft.key}
                sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2">نشانی {faIndex.format(index + 1)}</Typography>
                  <IconButton
                    aria-label={`حذف نشانی ${faIndex.format(index + 1)}`}
                    disabled={submitting}
                    onClick={() => setDrafts((current) => current.filter((row) => row.key !== draft.key))}
                  >
                    <Trash2 size={18} />
                  </IconButton>
                </Stack>
                <Stack spacing={2} sx={{ mt: 1 }}>
                  <TextField
                    size="small"
                    label="برچسب"
                    required
                    value={draft.label}
                    disabled={submitting}
                    onChange={(event) => patch(draft.key, { label: event.target.value })}
                    inputProps={{ maxLength: 60 }}
                  />
                  <TextField
                    size="small"
                    label="نام گیرنده"
                    required
                    value={draft.receiverName}
                    disabled={submitting}
                    onChange={(event) => patch(draft.key, { receiverName: event.target.value })}
                    inputProps={{ maxLength: 200 }}
                  />
                  <TextField
                    size="small"
                    label="موبایل گیرنده"
                    required
                    value={draft.mobile}
                    disabled={submitting}
                    onChange={(event) => patch(draft.key, { mobile: event.target.value })}
                    inputProps={{ maxLength: 20, dir: 'ltr' }}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      size="small"
                      label="کد استان"
                      required
                      value={draft.provinceCode}
                      disabled={submitting}
                      onChange={(event) =>
                        patch(draft.key, { provinceCode: event.target.value.toUpperCase() })
                      }
                      inputProps={{ maxLength: 3, dir: 'ltr' }}
                      sx={{ minWidth: 140 }}
                    />
                    <TextField
                      size="small"
                      label="شهر"
                      required
                      value={draft.city}
                      disabled={submitting}
                      onChange={(event) => patch(draft.key, { city: event.target.value })}
                      inputProps={{ maxLength: 60 }}
                    />
                    <TextField
                      size="small"
                      label="کد پستی"
                      value={draft.postalCode}
                      disabled={submitting}
                      onChange={(event) => patch(draft.key, { postalCode: event.target.value })}
                      inputProps={{ maxLength: 10, dir: 'ltr' }}
                    />
                  </Stack>
                  <TextField
                    size="small"
                    label="نشانی"
                    required
                    multiline
                    minRows={2}
                    value={draft.addressLine}
                    disabled={submitting}
                    onChange={(event) => patch(draft.key, { addressLine: event.target.value })}
                    inputProps={{ maxLength: 500 }}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={draft.isDefault}
                        disabled={submitting}
                        onChange={(event) => setDefault(draft.key, event.target.checked)}
                      />
                    }
                    label="نشانی پیش‌فرض"
                  />
                </Stack>
              </Box>
            ))}

            <Button
              startIcon={<Plus size={16} />}
              disabled={submitting}
              onClick={() => setDrafts((current) => [...current, emptyDraft()])}
              sx={{ alignSelf: 'flex-start' }}
            >
              افزودن نشانی
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onClose} disabled={submitting}>
            انصراف
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'در حال ذخیره…' : 'ذخیرهٔ نشانی‌ها'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
