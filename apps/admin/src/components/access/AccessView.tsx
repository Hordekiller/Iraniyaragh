'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  KeyRound,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  AccessPermission,
  AccessRole,
  AccessRoleDetail,
  AccessRoleHistoryEntry,
  AccessRoleMember,
} from '@iranyaragh/contracts';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  getAccessRole,
  listAccessRoleHistory,
  listAccessPermissions,
  listAccessRoles,
} from '@/lib/access/access-api';
import {
  accessActionLabel,
  accessErrorMessage,
  formatAccessCount,
  formatAccessDate,
  permissionLabel,
  roleStatusLabel,
  roleStatusTone,
} from '@/lib/access/access-labels';
import { AssignMemberDialog } from './AssignMemberDialog';
import { PermissionsDialog } from './PermissionsDialog';
import { RevokeMemberDialog } from './RevokeMemberDialog';
import { RoleFormDialog } from './RoleFormDialog';

const HISTORY_PAGE_SIZE = 8;
const MANAGE_PERMISSION = 'roles.manage';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit' }
  | { kind: 'permissions' }
  | { kind: 'assign' }
  | { kind: 'revoke'; member: AccessRoleMember };

function memberLabel(member: AccessRoleMember): string {
  return member.displayName?.trim() || member.mobileMasked || member.emailMasked || member.userId;
}

function memberStatusLabel(member: AccessRoleMember): string {
  if (member.assignmentExpired) return 'منقضی';
  if (member.status === 'ACTIVE') return 'فعال';
  if (member.status === 'PENDING') return 'در انتظار تأیید';
  if (member.status === 'SUSPENDED') return 'معلق';
  if (member.status === 'LOCKED') return 'قفل‌شده';
  return 'حذف‌شده';
}

function memberStatusTone(member: AccessRoleMember) {
  if (member.assignmentExpired || member.status !== 'ACTIVE') return 'warning' as const;
  return 'success' as const;
}

function historySummary(entry: AccessRoleHistoryEntry): string {
  const metadata = entry.metadata && typeof entry.metadata === 'object' ? (entry.metadata as Record<string, unknown>) : null;
  if (!metadata) return '';
  if (Array.isArray(metadata.permissionKeys)) return `${formatAccessCount(metadata.permissionKeys.length)} دسترسی`;
  if (typeof metadata.expiresAt === 'string') return `انقضا: ${formatAccessDate(metadata.expiresAt)}`;
  if (typeof metadata.reason === 'string' && metadata.reason) return metadata.reason;
  return '';
}

function mergeRole(roles: AccessRole[], detail: AccessRoleDetail): AccessRole[] {
  const next = roles.filter((role) => role.id !== detail.id);
  next.push(detail);
  return next.sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
}

export function AccessView() {
  const { user } = useAuth();
  const canManage = Boolean(user?.permissions.includes(MANAGE_PERMISSION));
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [permissions, setPermissions] = useState<AccessPermission[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AccessRoleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [history, setHistory] = useState<AccessRoleHistoryEntry[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [refreshToken, setRefreshToken] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const loadOverview = useCallback(async (signal?: AbortSignal) => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const [roleData, permissionData] = await Promise.all([
        listAccessRoles(signal),
        listAccessPermissions(signal),
      ]);
      setRoles(roleData.items);
      setPermissions(permissionData.items);
      setSelectedId((current) => current ?? roleData.items[0]?.id ?? null);
    } catch (failure) {
      if (signal?.aborted) return;
      setOverviewError(accessErrorMessage(failure));
    } finally {
      if (!signal?.aborted) setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage) {
      setOverviewLoading(false);
      return;
    }
    const controller = new AbortController();
    void loadOverview(controller.signal);
    return () => controller.abort();
  }, [canManage, loadOverview]);

  useEffect(() => {
    if (!canManage || !selectedId) {
      setDetail(null);
      setHistory([]);
      setHistoryTotal(0);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    Promise.all([
      getAccessRole(selectedId, controller.signal),
      listAccessRoleHistory(selectedId, historyPage, HISTORY_PAGE_SIZE, controller.signal),
    ])
      .then(([role, historyData]) => {
        setDetail(role);
        setHistory(historyData.items);
        setHistoryTotal(historyData.total);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setDetailError(accessErrorMessage(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [canManage, selectedId, historyPage, refreshToken]);

  const filteredRoles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fa');
    if (!query) return roles;
    return roles.filter(
      (role) =>
        role.key.toLocaleLowerCase('fa').includes(query) ||
        role.name.toLocaleLowerCase('fa').includes(query) ||
        (role.description ?? '').toLocaleLowerCase('fa').includes(query),
    );
  }, [roles, search]);

  const selectRole = (id: string) => {
    setSelectedId(id);
    setHistoryPage(1);
    setActionError(null);
  };

  const handleSaved = (role: AccessRoleDetail) => {
    setRoles((current) => mergeRole(current, role));
    setDetail(role);
    setSelectedId(role.id);
    setHistoryPage(1);
    setRefreshToken((value) => value + 1);
    setActionError(null);
  };

  const closeDialog = () => setDialog({ kind: 'none' });

  if (!canManage) {
    return (
      <>
        <PageHeader title="نقش‌ها و دسترسی" description="مدیریت نقش‌های کارکنان و مجوزهای عملیاتی." />
        <EmptyState
          icon={<Lock size={28} />}
          title="دسترسی ندارید"
          description="حساب شما مجوز «مدیریت نقش‌ها و دسترسی» را ندارد. برای دسترسی با مدیر سیستم هماهنگ کنید."
        />
      </>
    );
  }

  const totalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="نقش‌ها و دسترسی"
        eyebrow="سیستم"
        description="نقش‌های کارکنان، مجوزهای دقیق و اعضای هر نقش را مدیریت کنید. تغییرات بلافاصله روی نشست‌های فعال اعمال می‌شود."
        breadcrumbs={[{ label: 'سیستم' }, { label: 'نقش‌ها و دسترسی' }]}
        actions={
          <Stack direction="row" spacing={1}>
            <Tooltip title="نوسازی">
              <span>
                <IconButton
                  aria-label="نوسازی نقش‌ها"
                  onClick={() => {
                    void loadOverview();
                    setRefreshToken((value) => value + 1);
                  }}
                  disabled={overviewLoading}
                >
                  <RefreshCw size={18} />
                </IconButton>
              </span>
            </Tooltip>
            <Button
              variant="contained"
              size="small"
              startIcon={<Plus size={16} />}
              onClick={() => setDialog({ kind: 'create' })}
            >
              نقش جدید
            </Button>
          </Stack>
        }
      />

      {overviewError ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void loadOverview()}>
              تلاش دوباره
            </Button>
          }
        >
          {overviewError}
        </Alert>
      ) : null}
      {actionError ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '340px minmax(0, 1fr)' }, gap: 3 }}>
        <Paper variant="outlined" sx={{ p: 2, alignSelf: 'start' }}>
          <TextField
            size="small"
            fullWidth
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جستجوی نقش"
            inputProps={{ 'aria-label': 'جستجوی نقش' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <KeyRound size={16} />
                </InputAdornment>
              ),
            }}
          />
          <Box sx={{ mt: 1.5 }}>
            {overviewLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={26} />
              </Box>
            ) : filteredRoles.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                نقشی یافت نشد.
              </Typography>
            ) : (
              <List dense disablePadding>
                {filteredRoles.map((role) => (
                  <ListItemButton
                    key={role.id}
                    selected={selectedId === role.id}
                    onClick={() => selectRole(role.id)}
                    sx={{ borderRadius: 2, mb: 0.5, alignItems: 'flex-start' }}
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                          <Typography variant="body2" fontWeight={800}>
                            {role.name}
                          </Typography>
                          {role.isSystem ? <Chip size="small" label="سیستمی" color="info" variant="outlined" /> : null}
                          <StatusChip
                            label={roleStatusLabel(role.isActive)}
                            tone={roleStatusTone(role.isActive)}
                            size="small"
                          />
                        </Stack>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary" dir="ltr" sx={{ display: 'block' }}>
                            {role.key}
                          </Typography>
                          <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              {formatAccessCount(role.permissionKeys.length)} دسترسی
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatAccessCount(role.activeMemberCount)} عضو فعال
                            </Typography>
                          </Stack>
                        </Box>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, minHeight: 360 }}>
          {detailLoading && !detail ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
              <CircularProgress size={30} />
            </Box>
          ) : detailError ? (
            <Alert severity="error">{detailError}</Alert>
          ) : !detail ? (
            <EmptyState
              icon={<ShieldCheck size={28} />}
              title="نقشی انتخاب نشده است"
              description="یک نقش را از فهرست انتخاب کنید یا نقش جدید بسازید."
            />
          ) : (
            <Stack spacing={2.5}>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="h5" fontWeight={800}>
                    {detail.name}
                  </Typography>
                  <StatusChip label={roleStatusLabel(detail.isActive)} tone={roleStatusTone(detail.isActive)} />
                  {detail.isSystem ? <Chip size="small" label="نقش سیستمی" color="info" variant="outlined" /> : null}
                  <Chip size="small" label={`نسخهٔ ${formatAccessCount(detail.version)}`} variant="outlined" />
                </Stack>
                <Typography variant="caption" color="text.secondary" dir="ltr" sx={{ display: 'block', mt: 0.5 }}>
                  {detail.key}
                </Typography>
                {detail.description ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {detail.description}
                  </Typography>
                ) : null}
              </Box>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" startIcon={<Pencil size={15} />} onClick={() => setDialog({ kind: 'edit' })}>
                  ویرایش نقش
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ShieldCheck size={15} />}
                  onClick={() => setDialog({ kind: 'permissions' })}
                >
                  ویرایش دسترسی‌ها
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<UserPlus size={15} />}
                  onClick={() => setDialog({ kind: 'assign' })}
                  disabled={!detail.isActive}
                >
                  افزودن عضو
                </Button>
              </Stack>

              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <ShieldCheck size={18} />
                  <Typography variant="subtitle1" fontWeight={800}>
                    دسترسی‌ها
                  </Typography>
                  <Chip size="small" label={formatAccessCount(detail.permissions.length)} />
                </Stack>
                {detail.permissions.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    این نقش هیچ دسترسی‌ای ندارد.
                  </Typography>
                ) : (
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {detail.permissions.map((permission) => (
                      <Tooltip key={permission.key} title={permission.key}>
                        <Chip size="small" label={permissionLabel(permission)} variant="outlined" />
                      </Tooltip>
                    ))}
                  </Stack>
                )}
              </Box>

              <Divider />

              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Users size={18} />
                  <Typography variant="subtitle1" fontWeight={800}>
                    اعضا
                  </Typography>
                  <Chip size="small" label={formatAccessCount(detail.memberCount)} />
                </Stack>
                {detail.members.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    هنوز عضوی به این نقش اضافه نشده است.
                  </Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>کاربر</TableCell>
                        <TableCell>وضعیت</TableCell>
                        <TableCell>افزوده‌شده</TableCell>
                        <TableCell>انقضا</TableCell>
                        <TableCell align="left">عملیات</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.members.map((member) => (
                        <TableRow key={member.userId}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={700}>
                              {memberLabel(member)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" dir="ltr">
                              {[member.mobileMasked, member.emailMasked].filter(Boolean).join(' · ')}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <StatusChip
                              label={memberStatusLabel(member)}
                              tone={memberStatusTone(member)}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">{formatAccessDate(member.assignedAt)}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">{formatAccessDate(member.expiresAt)}</Typography>
                          </TableCell>
                          <TableCell align="left">
                            <Tooltip title="حذف دسترسی">
                              <IconButton
                                size="small"
                                color="error"
                                aria-label={`حذف دسترسی ${memberLabel(member)}`}
                                onClick={() => setDialog({ kind: 'revoke', member })}
                              >
                                <Trash2 size={16} />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Box>

              <Divider />

              <Box>
                <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>
                  تاریخچهٔ تغییرات
                </Typography>
                {history.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    رویدادی ثبت نشده است.
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {history.map((entry) => (
                      <Box
                        key={entry.id}
                        sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={700}>
                            {accessActionLabel(entry.action)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {entry.actorLabel ?? 'سیستم'}
                            {historySummary(entry) ? ` — ${historySummary(entry)}` : ''}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {formatAccessDate(entry.createdAt)}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                )}
                {historyTotal > HISTORY_PAGE_SIZE ? (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
                    <Button size="small" disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => page - 1)}>
                      قبلی
                    </Button>
                    <Typography variant="caption" color="text.secondary">
                      صفحهٔ {formatAccessCount(historyPage)} از {formatAccessCount(totalPages)}
                    </Typography>
                    <Button
                      size="small"
                      disabled={historyPage >= totalPages}
                      onClick={() => setHistoryPage((page) => page + 1)}
                    >
                      بعدی
                    </Button>
                  </Stack>
                ) : null}
              </Box>
            </Stack>
          )}
        </Paper>
      </Box>

      <RoleFormDialog
        open={dialog.kind === 'create' || dialog.kind === 'edit'}
        role={dialog.kind === 'edit' ? detail : null}
        permissions={permissions}
        user={user}
        onClose={closeDialog}
        onSaved={handleSaved}
      />
      <PermissionsDialog
        open={dialog.kind === 'permissions'}
        role={detail}
        permissions={permissions}
        user={user}
        onClose={closeDialog}
        onSaved={handleSaved}
      />
      <AssignMemberDialog
        open={dialog.kind === 'assign'}
        role={detail}
        onClose={closeDialog}
        onSaved={handleSaved}
      />
      <RevokeMemberDialog
        open={dialog.kind === 'revoke'}
        role={detail}
        member={dialog.kind === 'revoke' ? dialog.member : null}
        onClose={closeDialog}
        onSaved={handleSaved}
      />
    </>
  );
}
