'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Alert,
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Typography,
} from '@mui/material';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';

export function ProfileMenu() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleSignOut() {
    setAnchor(null);
    setSigningOut(true);
    setLogoutError(null);
    try {
      await signOut();
      router.replace('/login');
      router.refresh();
    } catch {
      setLogoutError('خروج از حساب تأیید نشد. ارتباط را بررسی و دوباره تلاش کنید.');
    } finally { setSigningOut(false); }
  }

  return (
    <>
      <IconButton
        disabled={signingOut}
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="منوی حساب کاربری"
        sx={{ p: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40, fontSize: 15 }}>
          ک
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
            کاربر کارکنان
          </Typography>
          <Typography variant="caption" color="text.secondary" dir="ltr">
            {user?.userId ?? '—'} · {user?.authenticationLevel ?? '—'}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={handleSignOut}>
          <ListItemIcon sx={{ color: 'error.main' }}>
            <LogOut size={18} />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>خروج از حساب</ListItemText>
        </MenuItem>
      </Menu>
      <Snackbar open={Boolean(logoutError)} onClose={() => setLogoutError(null)}>
        <Alert severity="error" role="alert" onClose={() => setLogoutError(null)}>{logoutError}</Alert>
      </Snackbar>
    </>
  );
}
