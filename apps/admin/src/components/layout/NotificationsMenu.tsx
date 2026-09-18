'use client';

import { useState } from 'react';
import { Box, Divider, IconButton, Menu, Typography } from '@mui/material';
import { Bell, BellOff } from 'lucide-react';

export function NotificationsMenu() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchor);

  return (
    <>
      <IconButton
        size="medium"
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-label="اعلان‌ها"
        aria-haspopup="menu"
        aria-expanded={open}
        sx={{ bgcolor: 'action.hover' }}
      >
        <Bell size={19} />
      </IconButton>

      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 340, maxWidth: '90vw', mt: 1 } } }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1.25 }}>
          <Typography fontWeight={800} variant="subtitle2">
            اعلان‌ها
          </Typography>
        </Box>
        <Divider />
        <Box
          role="status"
          sx={{
            display: 'grid',
            justifyItems: 'center',
            gap: 1,
            px: 3,
            py: 4,
            textAlign: 'center',
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              display: 'grid',
              width: 44,
              height: 44,
              color: 'text.secondary',
              bgcolor: 'action.hover',
              borderRadius: '50%',
              placeItems: 'center',
            }}
          >
            <BellOff size={21} />
          </Box>
          <Typography variant="body2" fontWeight={800}>
            جریان اعلان متصل نیست
          </Typography>
          <Typography variant="caption" color="text.secondary">
            تا زمان ارائه قرارداد واقعی اعلان، هیچ ردیف نمونه‌ای نمایش داده نمی‌شود.
          </Typography>
        </Box>
      </Menu>
    </>
  );
}
