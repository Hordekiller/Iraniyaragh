'use client';

import Link from 'next/link';
import { Box, Button, Stack, Typography } from '@mui/material';
import type { InAppNotification } from '@iranyaragh/contracts';
import { safeHref } from '@/lib/notifications/api';

const when = (iso: string) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date(iso));

export function NotificationsList({ items, onToggle, onNavigate }: { items: InAppNotification[]; onToggle: (item: InAppNotification) => void; onNavigate?: (item: InAppNotification) => void }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {items.map(item => {
        const href = safeHref(item.href);
        const body = (
          <>
            <Typography variant="body2" fontWeight={item.read ? 600 : 900}>
              {!item.read && <Box component="span" aria-hidden="true" sx={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', mr: 1 }} />}
              {item.title}{!item.read && <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}> (خوانده‌نشده)</Box>}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">{item.body}</Typography>
            <Typography variant="caption" color="text.disabled" component="time" dateTime={item.createdAt}>{when(item.createdAt)}</Typography>
          </>
        );
        return (
          <Box component="li" key={item.id} sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: item.read ? 'transparent' : 'action.hover' }}>
            <Stack direction="row" gap={1} alignItems="flex-start">
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {href ? <Link href={href} onClick={() => onNavigate?.(item)} style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}>{body}</Link> : body}
              </Box>
              <Button size="small" onClick={() => onToggle(item)}>{item.read ? 'نخوانده' : 'خوانده'}</Button>
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}
