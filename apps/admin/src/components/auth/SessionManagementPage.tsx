'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Skeleton,
  Tooltip,
  Typography,
} from '@mui/material';
import { KeySquare, Laptop, LogOut, MonitorSmartphone, Smartphone } from 'lucide-react';
import type { SessionSummary } from '@iranyaragh/contracts';
import { EmptyState } from '@/components/ui/EmptyState';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { getAccessToken } from '@/lib/auth/token-store';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAuthSessions } from '@/lib/auth/use-auth-sessions';
import { isSessionFixtureEnabled, resolveSessionManagementService } from '@/lib/auth/session-guard';
import { expiryLabel, formatDateTime, sessionLabels } from '@/lib/auth/session-labels';
import { SessionConfirmDialog } from './SessionConfirmDialog';

function deviceIcon(deviceName: string | null) {
  const name = deviceName ?? '';
  if (name.includes('موبایل')) return <Smartphone size={20} />;
  return <Laptop size={20} />;
}

export function SessionManagementPage() {
  return (
    <FeedbackProvider>
      <SessionManagementContent />
    </FeedbackProvider>
  );
}

function SessionManagementContent() {
  const { signOut } = useAuth();
  const service = useMemo(() => resolveSessionManagementService(() => getAccessToken()), []);
  const model = useAuthSessions({ service, onSessionEnded: () => void signOut() });
  const fixture = isSessionFixtureEnabled();
  const [confirmTarget, setConfirmTarget] = useState<SessionSummary | 'all' | null>(null);

  const confirmBusy =
    model.actionBusy !== null && (confirmTarget === 'all' || (model.busySessionId ?? '') === confirmTarget?.sessionId);

  return (
    <Box>
      <PageHeader
        eyebrow="سیستم / امنیت"
        title="نشست‌ها و دستگاه‌ها"
        description="مشاهدهٔ نشست‌های فعال حساب مدیریتی، خروج از سایر دستگاه‌ها و خروج از همهٔ دستگاه‌ها (#50)."
        breadcrumbs={[{ label: 'تنظیمات', href: '/settings' }, { label: 'نشست‌ها و دستگاه‌ها' }]}
      />

      {fixture ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          این صفحه هم‌اکنون بر اساس فیکسچر قطعی (NEXT_PUBLIC_SESSION_FIXTURE=true) نمایش داده می‌شود؛ در اجرای واقعی
          نشست‌های زندهٔ حساب مدیر جایگزین خواهد شد.
        </Alert>
      ) : null}

      {model.requireReauth ? (
        <EmptyState
          icon={<KeySquare size={30} />}
          title="نشست شما منقضی شده است"
          description="برای ادامهٔ مدیریت نشست‌ها، لازم است دوباره با حساب مدیریتی خود وارد شوید."
          action={
            <Button variant="contained" href="/login/staff" component="a">
              ورود مجدد به پنل
            </Button>
          }
        />
      ) : null}

      {model.status === 'loading' && !model.requireReauth ? (
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Skeleton height={128} />
          <Skeleton height={300} />
        </Box>
      ) : null}

      {model.status === 'error' && !model.requireReauth ? (
        <EmptyState
          icon={<MonitorSmartphone size={30} />}
          title="نمایش نشست‌ها ممکن نیست"
          description={model.loadError ?? 'خطای غیرمنتظره سامانه.'}
          action={
            <Button variant="contained" onClick={() => void model.reload()}>
              تلاش مجدد
            </Button>
          }
        />
      ) : null}

      {model.status === 'ready' ? (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  دستگاه‌های فعال
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {model.sessions.length === 0
                    ? 'نشستی فعال نیست.'
                    : `${model.sessions.length} نشست فعال برای این حساب.`}
                </Typography>
              </Box>
              <Button
                variant="contained"
                color="error"
                startIcon={<LogOut size={18} />}
                disabled={model.actionBusy !== null || model.sessions.length === 0}
                onClick={() => setConfirmTarget('all')}
                sx={{ mt: 1 }}
              >
                خروج از همهٔ دستگاه‌ها
              </Button>
            </Box>

            <Divider sx={{ my: 2 }} />

            {model.sessions.length === 0 ? (
              <Box role="status" aria-live="polite" sx={{ py: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  پس از خروج از همهٔ دستگاه‌ها، این حساب هیچ نشست فعالی ندارد.
                </Typography>
              </Box>
            ) : null}

            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
              {model.sessions.map((session) => {
                const level = sessionLabels.authenticationLevel(session.authenticationLevel);
                const expiry = expiryLabel(session.expiresAt);
                return (
                  <Box component="li" key={session.sessionId} data-testid={`session-row-${session.sessionId}`}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 2,
                        bgcolor: 'action.hover',
                        borderRadius: 2,
                        px: 2,
                        py: 1.5,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, minWidth: 0 }}>
                        <Box
                          aria-hidden="true"
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            width: 36,
                            height: 36,
                            bgcolor: 'background.paper',
                            color: 'text.secondary',
                            flexShrink: 0,
                          }}
                        >
                          {deviceIcon(session.deviceName)}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {sessionLabels.deviceName(session.deviceName)}
                            </Typography>
                            {session.current ? (
                              <Chip
                                label={sessionLabels.current.label}
                                size="small"
                                color="success"
                                variant="outlined"
                              />
                            ) : null}
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
                            <StatusChip label={level.label} tone={level.tone} />
                            <StatusChip label={expiry.label} tone={expiry.tone} />
                            <Typography variant="caption" color="text.secondary" component="span">
                              ساخت‌شده: {formatDateTime(session.createdAt)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" component="span">
                              آخرین فعالیت: {formatDateTime(session.lastUsedAt)}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Tooltip title={session.current ? 'بستن نشست همین دستگاه' : 'بستن نشست این دستگاه'}>
                          <span>
                            <IconButton
                              size="small"
                              aria-label={`خروج از دستگاه ${sessionLabels.deviceName(session.deviceName)}`}
                              disabled={model.actionBusy !== null}
                              onClick={() => setConfirmTarget(session)}
                              color="inherit"
                            >
                              <LogOut size={18} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </CardContent>
        </Card>
      ) : null}

      <SessionConfirmDialog
        open={confirmTarget !== null}
        setOpen={(open) => {
          if (!open) setConfirmTarget(null);
        }}
        busy={confirmBusy}
        title={confirmTarget === 'all' ? 'خروج از همهٔ دستگاه‌ها' : `خروج از «${sessionLabels.deviceName(confirmTarget?.deviceName ?? null)}»`}
        description={
          confirmTarget === 'all'
            ? 'از تمام نشست‌های فعال این حساب خارج می‌شوید؛ از جمله همین دستگاه. برای ادامهٔ کار لازم است دوباره وارد شوید.'
            : 'این نشست بلافاصله از پنل مدیریت خارج می‌شود و برای استفادهٔ مجدد باید دوباره وارد شود.'
        }
        confirmLabel={confirmTarget === 'all' ? 'خروج از همه' : 'خروج از این دستگاه'}
        onConfirm={() => {
          if (confirmTarget === 'all') {
            model.logoutAll();
          } else if (confirmTarget) {
            model.revoke(confirmTarget);
          }
          setConfirmTarget(null);
        }}
      />
    </Box>
  );
}