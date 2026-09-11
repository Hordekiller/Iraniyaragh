'use client';

import { Alert, Box, Button, Dialog, DialogActions, DialogContent, Typography } from '@mui/material';
import { MonitorSmartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { DialogCloseButton } from '@/components/ui/DialogCloseButton';

export type SessionConfirmDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  busy: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
};

/**
 * Guarded confirmation for destructive session actions (revoke one device /
 * logout-all). The dialog never intercepts an in-flight request and the confirm
 * action runs outside the dialog's close handler so a busy action stays honest.
 */
export function SessionConfirmDialog({
  open,
  setOpen,
  busy,
  title,
  description,
  confirmLabel,
  onConfirm,
}: SessionConfirmDialogProps) {
  const handleClose = () => {
    if (busy) return;
    setOpen(false);
  };

  const handleConfirm = () => {
    if (busy) return;
    setOpen(false);
    onConfirm();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs" scroll="body" aria-labelledby="session-confirm-title">
      <DialogCloseButton onClick={handleClose} />
      <DialogContent sx={{ pt: 6, pb: 2, px: 4 }}>
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
            color: 'warning.main',
            mx: 'auto',
          }}
        >
          <MonitorSmartphone size={32} />
        </Box>
        <Typography id="session-confirm-title" variant="h6" sx={{ mt: 2, fontWeight: 700, textAlign: 'center' }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
          {description}
        </Typography>
        <Alert severity="warning" sx={{ mt: 3 }}>
          با این کار دسترسی آن دستگاه به پنل مدیریت بلافاصله قطع می‌شود و نیاز به ورود مجدد دارد.
        </Alert>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', gap: 1, pb: 3 }}>
        <Button variant="outlined" color="secondary" onClick={handleClose} disabled={busy}>
          انصراف
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleConfirm}
          disabled={busy}
          data-testid="session-confirm-button"
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}