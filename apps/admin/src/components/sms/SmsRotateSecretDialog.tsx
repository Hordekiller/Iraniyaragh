'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material';
import { DialogCloseButton } from '@/components/ui/DialogCloseButton';

export type SmsRotateSecretDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  busy: boolean;
  onSubmit: (secret: string) => void;
};

const SECRET_MIN_LENGTH = 16;
const SECRET_MAX_LENGTH = 512;

/* eslint-disable-next-line no-control-regex */
const NO_PADDING_OR_CONTROL = new RegExp('^[^\\s\\u0000-\\u001F\\u007F]+$', 'u');

/**
 * The secret is write-only and must never be normalized: the exact value the
 * operator pastes is sent to the API, byte-for-byte. The dialog therefore
 * validates the exact input (length, no whitespace, no control characters, no
 * surrounding padding) and rejects anything that is "only valid after trimming"
 * instead of silently trimming it. No length/character filtering is applied on
 * change, so pasted secrets are never altered.
 */
function isExactlyValidSecret(secret: string): boolean {
  if (secret.length < SECRET_MIN_LENGTH || secret.length > SECRET_MAX_LENGTH) return false;
  return NO_PADDING_OR_CONTROL.test(secret);
}

export function SmsRotateSecretDialog({ open, setOpen, busy, onSubmit }: SmsRotateSecretDialogProps) {
  const [secret, setSecret] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);

  const secretValid = isExactlyValidSecret(secret);
  const canSubmit = secretValid && confirmed;
  const secretError = touched && !secretValid && secret.length > 0;
  const secretHelperText =
    secretError && secret.length > 0
      ? `کلید باید دقیقاً همان مقداری باشد که ذخیره می‌شود: طول بین ${SECRET_MIN_LENGTH} و ${SECRET_MAX_LENGTH} نویسه، بدون فاصله، نویسهٔ کنترلی یا padding.`
      : undefined;
  const emptyError = touched && secret.length === 0;

  const handleClose = () => {
    if (busy) return;
    setSecret('');
    setConfirmed(false);
    setTouched(false);
    setOpen(false);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    onSubmit(secret);
    setSecret('');
    setConfirmed(false);
    setTouched(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs" scroll="body" aria-labelledby="rotate-secret-title">
      <DialogCloseButton onClick={handleClose} />
      <Box component="form" onSubmit={handleSubmit} noValidate>
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
            <KeyRound size={32} />
          </Box>
          <Typography id="rotate-secret-title" variant="h6" sx={{ mt: 2, fontWeight: 700, textAlign: 'center' }}>
            چرخش کلید سرویس پیامک
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
            کلید جدید به صورت write-only ثبت می‌شود و پس از ذخیره هیچ‌گاه در پنل نمایش داده نمی‌شود.
          </Typography>

          <TextField
            autoFocus
            fullWidth
            type="password"
            autoComplete="new-password"
            label="کلید جدید سرویس پیامک"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            error={secretError || emptyError}
            helperText={secretError ? secretHelperText : emptyError ? 'وارد کردن کلید جدید الزامی است' : undefined}
            inputProps={{ 'aria-required': true }}
            disabled={busy}
            sx={{ mt: 3 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                disabled={busy}
                color="warning"
              />
            }
            label="تأیید می‌کنم کلید سرویس پیامک جایگزین شود؛ پیام‌های OTP پس از ثبت با کلید جدید ارسال می‌شوند."
            sx={{ mt: 1, alignItems: 'flex-start' }}
          />
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', gap: 1, pb: 3 }}>
          <Button variant="outlined" color="secondary" onClick={handleClose} disabled={busy}>
            انصراف
          </Button>
          <Button variant="contained" color="warning" type="submit" disabled={busy || !canSubmit}>
            ثبت کلید جدید
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}