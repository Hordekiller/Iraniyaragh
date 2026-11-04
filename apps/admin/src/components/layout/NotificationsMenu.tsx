'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Box, Button, Divider, IconButton, Menu, Stack, Typography } from '@mui/material';
import { Bell } from 'lucide-react';
import type { InAppNotification } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listNotifications, markAllNotificationsRead, readUnreadCount, setNotificationRead } from '@/lib/notifications/api';
import { NotificationsList } from './NotificationsList';

const POLL_MS = 60_000;

export function NotificationsMenu() {
  const { user } = useAuth();
  const userId = user?.userId ?? null;
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<InAppNotification[] | null>(null);
  const [error, setError] = useState(false);
  const open = Boolean(anchor);

  const refreshCount = useCallback(() => { readUnreadCount().then(setUnread, () => undefined); }, []);
  const load = useCallback(() => {
    setError(false);
    listNotifications().then(page => { setItems(page.items); setUnread(page.unreadCount); }, () => setError(true));
  }, []);

  useEffect(() => {
    if (!userId) { setUnread(0); setItems(null); return; }
    refreshCount();
    const tick = () => { if (document.visibilityState === 'visible') refreshCount(); };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [userId, refreshCount]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const toggle = (item: InAppNotification) => {
    setNotificationRead(item.id, !item.read).then(next => { setItems(current => current?.map(row => (row.id === next.id ? next : row)) ?? current); refreshCount(); }, () => setError(true));
  };
  const navigate = (item: InAppNotification) => { setAnchor(null); if (!item.read) setNotificationRead(item.id, true).then(refreshCount, () => undefined); };
  const markAll = () => { markAllNotificationsRead().then(count => { setUnread(count); setItems(current => current?.map(row => ({ ...row, read: true })) ?? current); }, () => setError(true)); };

  return (
    <>
      <IconButton size="medium" onClick={event => setAnchor(event.currentTarget)} aria-label={unread > 0 ? `اعلان‌ها، ${unread.toLocaleString('fa-IR')} خوانده‌نشده` : 'اعلان‌ها'}
        aria-haspopup="menu" aria-expanded={open} sx={{ bgcolor: 'action.hover' }}>
        <Badge color="error" badgeContent={unread} max={99} invisible={unread === 0}><Bell size={19} /></Badge>
      </IconButton>
      <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { width: 380, maxWidth: '94vw', mt: 1 } } }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1 }}>
          <Typography fontWeight={800} variant="subtitle2">اعلان‌ها</Typography>
          <Button size="small" onClick={markAll} disabled={unread === 0}>همه را خوانده‌شده کن</Button>
        </Stack>
        <Divider />
        <Box sx={{ maxHeight: '60vh', overflowY: 'auto' }} aria-live="polite">
          {error && <Typography role="alert" color="error" variant="body2" sx={{ p: 2 }}>اعلان‌ها دریافت نشدند. <Button size="small" onClick={load}>تلاش دوباره</Button></Typography>}
          {!error && items === null && <Typography role="status" variant="body2" sx={{ p: 2 }}>در حال دریافت…</Typography>}
          {!error && items?.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>اعلانی وجود ندارد.</Typography>}
          {!error && items && items.length > 0 && <NotificationsList items={items} onToggle={toggle} onNavigate={navigate} />}
        </Box>
        <Divider />
        <Box sx={{ p: 1, textAlign: 'center' }}><Button component={Link} href="/notifications" size="small" onClick={() => setAnchor(null)}>مشاهدهٔ همهٔ اعلان‌ها</Button></Box>
      </Menu>
    </>
  );
}
