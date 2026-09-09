'use client';

import { useState, type ReactNode } from 'react';
import { Box, Divider, IconButton, List, ListItem, ListItemText, Menu, Typography, Badge } from '@mui/material';
import { Bell, CheckCheck } from 'lucide-react';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  timeLabel: string;
  icon: ReactNode;
  tone: 'primary' | 'warning' | 'error' | 'success';
};

const TONE_BG: Record<NotificationItem['tone'], string> = {
  primary: 'rgba(255,90,23,0.12)',
  warning: 'rgba(255,160,0,0.14)',
  error: 'rgba(211,47,47,0.12)',
  success: 'rgba(46,125,50,0.12)',
};

/**
 * Fixture notifications. No real notification stream exists yet (issue
 * backlog), so the panel renders clearly-labeled sample rows; it is never
 * presented as live data. See docs/ADMIN_PANEL_PLAN.md.
 */
const FIXTURE_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'sync-warning',
    title: 'همگام‌سازی ترابری',
    body: 'همگام‌سازی قیمت‌ها چند ساعت است اجرا نشده است.',
    timeLabel: '۱۰ دقیقه پیش',
    icon: <span aria-hidden="true" style={{ color: '#ff8f00' }}>●</span>,
    tone: 'warning',
  },
  {
    id: 'review-request',
    title: 'بررسی کالای جدید',
    body: 'یک کالای جدید در انتظار تأیید محتوا است.',
    timeLabel: '۱ ساعت پیش',
    icon: <span aria-hidden="true" style={{ color: '#ff5a17' }}>●</span>,
    tone: 'primary',
  },
  {
    id: 'import-done',
    title: 'درون‌ریزی مشتریان',
    body: 'درون‌ریزی نمونهٔ مشتریان با موفقیت پایان یافت.',
    timeLabel: 'دیروز',
    icon: <span aria-hidden="true" style={{ color: '#2e7d32' }}>✓</span>,
    tone: 'success',
  },
];

export function NotificationsMenu() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const open = Boolean(anchor);
  const unreadCount = FIXTURE_NOTIFICATIONS.filter((item) => !readIds.has(item.id)).length;

  return (
    <>
      <IconButton
        size="medium"
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-label={`اعلان‌ها${unreadCount > 0 ? `، ${unreadCount} خوانده‌نشده` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        sx={{ bgcolor: 'action.hover' }}
      >
        <Badge color="error" variant="dot" invisible={unreadCount === 0}>
          <Bell size={19} />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 340, maxWidth: '90vw', mt: 1 } } }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1 }}>
          <Typography fontWeight={800} variant="subtitle2">
            اعلان‌ها
          </Typography>
          <Box
            component="button"
            type="button"
            onClick={() => setReadIds(new Set(FIXTURE_NOTIFICATIONS.map((item) => item.id)))}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              bgcolor: 'transparent',
              border: 0,
              cursor: 'pointer',
              color: 'primary.main',
              typography: 'caption',
              fontWeight: 700,
            }}
          >
            <CheckCheck size={15} />
            خواندن همه
          </Box>
        </Box>
        <Divider />
        <Box
          component="span"
          sx={{ display: 'block', px: 2, py: 0.5, color: 'text.secondary', typography: 'caption' }}
        >
          دادهٔ آزمایشی — جریان واقعی اعلان هنوز متصل نشده است.
        </Box>
        <List dense disablePadding>
          {FIXTURE_NOTIFICATIONS.map((item) => {
            const read = readIds.has(item.id);
            return (
              <ListItem
                key={item.id}
                sx={{ gap: 1.5, px: 2, py: 1, opacity: read ? 0.6 : 1 }}
              >
                <Box
                  aria-hidden="true"
                  sx={{
                    display: 'grid',
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    bgcolor: TONE_BG[item.tone],
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </Box>
                <ListItemText
                  primary={
                    <Typography variant="body2" fontWeight={read ? 500 : 800}>
                      {item.title}
                    </Typography>
                  }
                  secondary={
                    <>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {item.body}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.timeLabel}
                      </Typography>
                    </>
                  }
                />
              </ListItem>
            );
          })}
        </List>
      </Menu>
    </>
  );
}