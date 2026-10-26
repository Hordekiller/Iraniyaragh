'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AccessRoleDetail, AccessRoleMember } from '@iranyaragh/contracts';
import { newAccessCommandKey, revokeAccessMember } from '@/lib/access/access-api';
import { accessErrorMessage } from '@/lib/access/access-labels';

type Props = {
  open: boolean;
  role: AccessRoleDetail | null;
  member: AccessRoleMember | null;
  onClose: () => void;
  onSaved: (role: AccessRoleDetail) => void;
};

export function RevokeMemberDialog({ open, role, member, onClose, onSaved }: Props) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError(null);
    setSubmitting(false);
  }, [open, member?.userId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!role || !member || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await revokeAccessMember(
        role.id,
        member.userId,
        { expectedVersion: role.version, reason: reason.trim() || null },
        newAccessCommandKey('revoke'),
      );
      onSaved(updated);
      onClose();
    } catch (failure) {
      setError(accessErrorMessage(failure));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="access-revoke-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle id="access-revoke-dialog-title">حذف عضو از نقش</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Typography variant="body2">
              دسترسی «{member?.displayName ?? member?.mobileMasked ?? 'کاربر'}» از نقش «{role?.name}» برداشته می‌شود.
              این تغییر بلافاصله روی نشست فعال اعمال می‌شود.
            </Typography>
            <TextField
              label="دلیل (اختیاری)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              fullWidth
              multiline
              minRows={2}
              inputProps={{ maxLength: 500 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>
            انصراف
          </Button>
          <Button type="submit" color="error" variant="contained" disabled={submitting || !role || !member}>
            حذف دسترسی
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
