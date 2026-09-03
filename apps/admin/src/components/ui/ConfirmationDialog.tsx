'use client';

import { useId, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  Box,
  TextField,
  CircularProgress,
} from '@mui/material';
import { DialogCloseButton } from './DialogCloseButton';

export type ConfirmationDialogType = 'delete' | 'archive' | 'deactivate' | 'dangerous';

export type ConfirmationDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  type?: ConfirmationDialogType;
  title: string;
  description: string;
  /** Called after the user confirms; receives the reason when required. */
  onConfirm: (reason?: string) => void | Promise<void>;
  /** Label shown on the primary confirm button. */
  confirmLabel?: string;
  loading?: boolean;
  /** Ask for a mandatory reason before confirming (sensitive commands, §6.5). */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** When set, shows a second "result" dialog after confirmation. */
  result?: 'success' | 'cancelled' | null;
};

const CONFIG: Record<
  ConfirmationDialogType,
  { iconColor: string; confirmColor: 'error' | 'warning' | 'info'; label: string }
> = {
  delete: { iconColor: 'error.main', confirmColor: 'error', label: 'حذف' },
  archive: { iconColor: 'warning.main', confirmColor: 'warning', label: 'بایگانی' },
  deactivate: { iconColor: 'warning.main', confirmColor: 'warning', label: 'غیرفعال‌سازی' },
  dangerous: { iconColor: 'error.main', confirmColor: 'error', label: 'تأیید نهایی' },
};

export function ConfirmationDialog({
  open,
  setOpen,
  type = 'delete',
  title,
  description,
  onConfirm,
  confirmLabel,
  loading = false,
  requireReason = false,
  reasonLabel = 'دلیل',
  reasonPlaceholder = 'دلیل انجام این عملیات را وارد کنید',
  result = null,
}: ConfirmationDialogProps) {
  const config = CONFIG[type];
  const titleId = useId();
  const descriptionId = useId();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);

  const handleClose = () => {
    if (loading) return;
    setReason('');
    setReasonError(false);
    setOpen(false);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (requireReason && reason.trim().length === 0) {
      setReasonError(true);
      return;
    }
    setReasonError(false);
    void onConfirm(requireReason ? reason.trim() : undefined);
  };

  const closeButton = <DialogCloseButton onClick={handleClose} />;

  if (result) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="xs"
        scroll="body"
        aria-labelledby={titleId}
      >
        {closeButton}
        <DialogContent sx={{ textAlign: 'center', pt: 6, pb: 2, px: 4 }}>
          <Box
            aria-hidden="true"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              width: 64,
              height: 64,
              bgcolor: 'action.hover',
              color: result === 'success' ? 'success.main' : 'text.secondary',
              mx: 'auto',
            }}
          >
            {result === 'success' ? <CheckCircle size={32} /> : <XCircle size={32} />}
          </Box>
          <Typography id={titleId} variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
            {result === 'success' ? 'انجام شد' : 'لغو شد'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {result === 'success' ? `${title} با موفقیت اعمال شد.` : 'عملیات توسط شما لغو شد.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
          <Button variant="outlined" color="secondary" onClick={handleClose}>
            بستن
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="xs"
      scroll="body"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <Box component="form" onSubmit={handleSubmit} noValidate>
        {closeButton}
        <DialogContent sx={{ textAlign: 'center', pt: 6, pb: 2, px: 4 }}>
          <Box
            aria-hidden="true"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              width: 64,
              height: 64,
              bgcolor: 'action.hover',
              color: config.iconColor,
              mx: 'auto',
            }}
          >
            <AlertTriangle size={32} />
          </Box>
          <Typography id={titleId} variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
            {title}
          </Typography>
          <Typography id={descriptionId} variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {description}
          </Typography>

          {requireReason ? (
            <TextField
              fullWidth
              multiline
              minRows={2}
              label={reasonLabel}
              placeholder={reasonPlaceholder}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError && event.target.value.trim().length > 0) {
                  setReasonError(false);
                }
              }}
              error={reasonError}
              helperText={reasonError ? 'وارد کردن دلیل الزامی است' : undefined}
              disabled={loading}
              sx={{ mt: 3, textAlign: 'end' }}
              inputProps={{ 'aria-required': true }}
            />
          ) : null}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', gap: 1, pb: 3 }}>
          <Button
            variant="outlined"
            color="secondary"
            onClick={handleClose}
            disabled={loading}
          >
            انصراف
          </Button>
          <Button
            variant="contained"
            color={config.confirmColor}
            type="submit"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {loading ? 'در حال انجام...' : (confirmLabel ?? config.label)}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
