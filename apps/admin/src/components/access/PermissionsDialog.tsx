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
  Typography,
} from '@mui/material';
import type { AccessPermission, AccessRoleDetail } from '@iranyaragh/contracts';
import type { AuthUser } from '@/lib/auth/AuthProvider';
import {
  newAccessCommandKey,
  replaceAccessPermissions,
} from '@/lib/access/access-api';
import { accessErrorMessage } from '@/lib/access/access-labels';
import { PermissionPicker } from './PermissionPicker';

type Props = {
  open: boolean;
  role: AccessRoleDetail | null;
  permissions: AccessPermission[];
  user: AuthUser | null;
  onClose: () => void;
  onSaved: (role: AccessRoleDetail) => void;
};

export function PermissionsDialog({ open, role, permissions, user, onClose, onSaved }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !role) return;
    setSelected(new Set(role.permissionKeys));
    setError(null);
    setSubmitting(false);
  }, [open, role]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!role || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await replaceAccessPermissions(
        role.id,
        { expectedVersion: role.version, permissionKeys: [...selected] },
        newAccessCommandKey('permissions'),
      );
      onSaved(updated);
      onClose();
    } catch (failure) {
      setError(accessErrorMessage(failure));
    } finally {
      setSubmitting(false);
    }
  }

  const lockedKeys = role?.key === 'system-admin' ? new Set(['roles.manage']) : undefined;

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby="access-permissions-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle id="access-permissions-dialog-title">
          ویرایش دسترسی‌های {role?.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Typography variant="body2" color="text.secondary">
              تغییرات بلافاصله بر نشست‌های فعال اعمال می‌شود. حداقل یک کاربر فعال باید مجوز مدیریت نقش‌ها را حفظ کند.
            </Typography>
            <PermissionPicker
              permissions={permissions}
              selected={selected}
              onChange={setSelected}
              actorPermissionKeys={new Set(user?.permissions ?? [])}
              lockedKeys={lockedKeys}
              disabled={submitting}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>
            انصراف
          </Button>
          <Button type="submit" variant="contained" disabled={submitting || !role}>
            ذخیرهٔ دسترسی‌ها
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
