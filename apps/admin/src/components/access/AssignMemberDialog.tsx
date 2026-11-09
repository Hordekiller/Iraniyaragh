'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AccessRoleDetail, AccessUser } from '@iranyaragh/contracts';
import { ApiAbortError } from '@/lib/api/client';
import {
  assignAccessMember,
  listAccessUsers,
  newAccessCommandKey,
} from '@/lib/access/access-api';
import { accessErrorMessage } from '@/lib/access/access-labels';

type Props = {
  open: boolean;
  role: AccessRoleDetail | null;
  onClose: () => void;
  onSaved: (role: AccessRoleDetail) => void;
};

function userLabel(user: AccessUser): string {
  return user.displayName?.trim() || user.mobileMasked || user.emailMasked || user.id;
}

function statusLabel(status: AccessUser['status']): string {
  if (status === 'ACTIVE') return 'فعال';
  if (status === 'PENDING') return 'در انتظار تأیید';
  if (status === 'SUSPENDED') return 'معلق';
  if (status === 'LOCKED') return 'قفل‌شده';
  return 'حذف‌شده';
}

export function AssignMemberDialog({ open, role, onClose, onSaved }: Props) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedUserId(null);
    setExpiresAt('');
    setError(null);
    setSubmitting(false);
  }, [open, role?.id]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      listAccessUsers({ search, perPage: 25 }, controller.signal)
        .then((data) => setUsers(data.items))
        .catch((failure: unknown) => {
          if (!(failure instanceof ApiAbortError)) setError(accessErrorMessage(failure));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, search]);

  const activeMemberIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      (role?.members ?? [])
        .filter((member) => !member.assignmentExpired && (!member.expiresAt || Date.parse(member.expiresAt) > now))
        .map((member) => member.userId),
    );
  }, [role]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!role || !selectedUserId || submitting) return;
    let expiresAtIso: string | null = null;
    if (expiresAt) {
      const parsed = new Date(expiresAt);
      if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        setError('زمان انقضا باید در آینده باشد.');
        return;
      }
      expiresAtIso = parsed.toISOString();
    }
    setError(null);
    setSubmitting(true);
    try {
      const updated = await assignAccessMember(
        role.id,
        { expectedVersion: role.version, userId: selectedUserId, expiresAt: expiresAtIso },
        newAccessCommandKey('assign'),
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
      maxWidth="sm"
      aria-labelledby="access-assign-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle id="access-assign-dialog-title">
          افزودن عضو به {role?.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="جستجوی کاربر"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              fullWidth
              size="small"
              placeholder="نام، ایمیل یا موبایل"
              inputProps={{ 'aria-label': 'جستجوی کاربر' }}
            />
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, maxHeight: 280, overflowY: 'auto' }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : users.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  کاربری یافت نشد.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {users.map((user) => {
                    const alreadyAssigned = activeMemberIds.has(user.id);
                    const unavailable = user.status !== 'ACTIVE' || alreadyAssigned;
                    return (
                      <ListItemButton
                        key={user.id}
                        selected={selectedUserId === user.id}
                        disabled={unavailable || submitting}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <ListItemText
                          primary={
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                              <Typography variant="body2" fontWeight={700}>
                                {userLabel(user)}
                              </Typography>
                              {alreadyAssigned ? (
                                <Chip size="small" label="از قبل عضو است" />
                              ) : null}
                              {user.status !== 'ACTIVE' ? (
                                <Chip size="small" color="warning" label={statusLabel(user.status)} />
                              ) : null}
                            </Stack>
                          }
                          secondary={
                            <Typography variant="caption" color="text.secondary" dir="ltr">
                              {[user.mobileMasked, user.emailMasked].filter(Boolean).join(' · ')}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
              )}
            </Box>
            <TextField
              label="انقضا (اختیاری)"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              helperText="حداکثر یک سال آینده؛ خالی یعنی بدون انقضا."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>
            انصراف
          </Button>
          <Button type="submit" variant="contained" disabled={submitting || !selectedUserId || !role}>
            افزودن عضو
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
