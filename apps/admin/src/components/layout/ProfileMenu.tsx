'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import { LogOut, Settings2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';

export function ProfileMenu() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);

  async function handleSignOut() {
    setAnchor(null);
    await signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <IconButton
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="منوی حساب کاربری"
        sx={{ p: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Avatar sx={{ bgcolor: 'secondary.main', width: 40, height: 40, fontSize: 15 }}>
          م
        </Avatar>
      </IconButton>

      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 280, maxWidth: '90vw', mt: 1 } } }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={800}>
            مدیر سیستم
          </Typography>
          <Typography variant="caption" color="text.secondary">
            حساب آزمایشی · {user?.authenticationLevel ?? '—'}
          </Typography>
        </Box>
        <Divider />
        <MenuItem disabled title="تنظیمات حساب هنوز پیاده‌سازی نشده است">
          <ListItemIcon>
            <Settings2 size={18} />
          </ListItemIcon>
          <ListItemText>تنظیمات حساب</ListItemText>
          <Typography variant="caption" color="text.secondary">
            به‌زودی
          </Typography>
        </MenuItem>
        <MenuItem disabled title="نقش‌ها و دسترسی‌ها هنوز پیاده‌سازی نشده است">
          <ListItemIcon>
            <ShieldCheck size={18} />
          </ListItemIcon>
          <ListItemText>نقش‌ها و دسترسی‌ها</ListItemText>
          <Typography variant="caption" color="text.secondary">
            به‌زودی
          </Typography>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleSignOut}>
          <ListItemIcon sx={{ color: 'error.main' }}>
            <LogOut size={18} />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>خروج از حساب</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}