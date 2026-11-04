'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import type { InAppNotification } from '@iranyaragh/contracts';
import { PageHeader } from '@/components/ui/PageHeader';
import { listNotifications, markAllNotificationsRead, setNotificationRead } from '@/lib/notifications/api';
import { NotificationsList } from './NotificationsList';

export function NotificationsHistory() {
  const [items, setItems] = useState<InAppNotification[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState(false);
  const load = useCallback((after?: string) => {
    setError(false);
    listNotifications(after).then(page => { setItems(current => (after && current ? [...current, ...page.items] : page.items)); setCursor(page.nextCursor); setUnread(page.unreadCount); }, () => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  const toggle = (item: InAppNotification) => setNotificationRead(item.id, !item.read).then(next => { setItems(c => c?.map(r => (r.id === next.id ? next : r)) ?? c); setUnread(n => Math.max(0, n + (next.read ? -1 : 1))); }, () => setError(true));
  const markAll = () => markAllNotificationsRead().then(count => { setUnread(count); setItems(c => c?.map(r => ({ ...r, read: true })) ?? c); }, () => setError(true));
  return (
    <Box>
      <PageHeader title="اعلان‌ها" description="رویدادهای عملیاتی که نیاز به اطلاع یا اقدام دارند." breadcrumbs={[{ label: 'اعلان‌ها' }]} />
      <Stack gap={2}>
        {error && <Alert severity="error">اعلان‌ها دریافت نشدند. <Button onClick={() => load()}>تلاش دوباره</Button></Alert>}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography role="status">{unread.toLocaleString('fa-IR')} خوانده‌نشده</Typography>
          <Button variant="outlined" onClick={() => void markAll()} disabled={unread === 0}>همه را خوانده‌شده کن</Button>
        </Stack>
        <Paper variant="outlined">
          {items === null && !error && <Typography role="status" sx={{ p: 3 }}>در حال دریافت…</Typography>}
          {items?.length === 0 && <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>هنوز اعلانی ثبت نشده است.</Typography>}
          {items && items.length > 0 && <NotificationsList items={items} onToggle={item => void toggle(item)} onNavigate={item => { if (!item.read) void toggle(item); }} />}
        </Paper>
        {cursor && <Button variant="outlined" onClick={() => load(cursor)}>نمایش قدیمی‌تر</Button>}
      </Stack>
    </Box>
  );
}
