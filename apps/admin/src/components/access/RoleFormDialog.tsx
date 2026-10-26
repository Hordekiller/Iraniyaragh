'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { AccessPermission, AccessRoleDetail } from '@iranyaragh/contracts';
import type { AuthUser } from '@/lib/auth/AuthProvider';
import {
  createAccessRole,
  newAccessCommandKey,
  updateAccessRole,
} from '@/lib/access/access-api';
import { accessErrorMessage } from '@/lib/access/access-labels';
import { PermissionPicker } from './PermissionPicker';

const ROLE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;

type Props = {
  open: boolean;
  role: AccessRoleDetail | null;
  permissions: AccessPermission[];
  user: AuthUser | null;
  onClose: () => void;
  onSaved: (role: AccessRoleDetail) => void;
};

export function RoleFormDialog({ open, role, permissions, user, onClose, onSaved }: Props) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [permissionKeys, setPermissionKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const actorPermissions = new Set(user?.permissions ?? []);
  const editing = role !== null;

  useEffect(() => {
    if (!open) return;
    setKey(role?.key ?? '');
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setIsActive(role?.isActive ?? true);
    setPermissionKeys(new Set(role?.permissionKeys ?? []));
    setError(null);
    setSubmitting(false);
  }, [open, role]);

  const systemRole = Boolean(role?.isSystem);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const trimmedKey = key.trim();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError('نام نقش باید حداقل دو نویسه باشد.');
      return;
    }
    if (!editing && !ROLE_KEY_PATTERN.test(trimmedKey)) {
      setError('شناسهٔ نقش باید با حرف کوچک انگلیسی شروع شود و فقط حروف کوچک، رقم، نقطه، خط تیره یا زیرخط داشته باشد.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (role) {
        const updated = await updateAccessRole(
          role.id,
          {
            expectedVersion: role.version,
            name: trimmedName,
            description: trimmedDescription || null,
            isActive,
          },
          newAccessCommandKey('update'),
        );
        onSaved(updated);
      } else {
        const created = await createAccessRole(
          {
            key: trimmedKey,
            name: trimmedName,
            description: trimmedDescription || null,
            permissionKeys: [...permissionKeys],
          },
          newAccessCommandKey('create'),
        );
        onSaved(created);
      }
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
      maxWidth={editing ? 'sm' : 'md'}
      aria-labelledby="access-role-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle id="access-role-dialog-title">
          {editing ? 'ویرایش نقش' : 'نقش جدید'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            {editing ? (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  شناسهٔ نقش
                </Typography>
                <Typography variant="body2" dir="ltr" sx={{ fontFamily: 'monospace' }}>
                  {role?.key}
                </Typography>
              </Box>
            ) : (
              <TextField
                label="شناسهٔ نقش"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                required
                fullWidth
                dir="ltr"
                helperText="حروف کوچک انگلیسی، رقم، نقطه، خط تیره یا زیرخط؛ مثال: catalog-editor"
                inputProps={{ maxLength: 100, 'aria-label': 'شناسهٔ نقش' }}
              />
            )}
            <TextField
              label="نام نقش"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              fullWidth
              inputProps={{ maxLength: 150, 'aria-label': 'نام نقش' }}
            />
            <TextField
              label="توضیح"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              fullWidth
              multiline
              minRows={2}
              inputProps={{ maxLength: 1000, 'aria-label': 'توضیح نقش' }}
            />
            {editing ? (
              <FormControlLabel
                control={
                  <Switch
                    checked={isActive}
                    onChange={(event) => setIsActive(event.target.checked)}
                    disabled={systemRole}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">نقش فعال است</Typography>
                    {systemRole ? (
                      <Typography variant="caption" color="text.secondary">
                        نقش سیستمی را نمی‌توان غیرفعال کرد.
                      </Typography>
                    ) : null}
                  </Box>
                }
              />
            ) : (
              <Box>
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                  دسترسی‌ها
                </Typography>
                <PermissionPicker
                  permissions={permissions}
                  selected={permissionKeys}
                  onChange={setPermissionKeys}
                  actorPermissionKeys={actorPermissions}
                  disabled={submitting}
                />
              </Box>
            )}
            {editing ? (
              <Typography variant="caption" color="text.secondary">
                برای تغییر دسترسی‌ها از دکمهٔ «ویرایش دسترسی‌ها» در جزئیات نقش استفاده کنید.
              </Typography>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>
            انصراف
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {editing ? 'ذخیرهٔ تغییرات' : 'ایجاد نقش'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
