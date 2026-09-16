'use client';

import { X } from 'lucide-react';
import { styled, IconButton } from '@mui/material';

const CloseButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  top: theme.spacing(2),
  insetInlineEnd: theme.spacing(2),
  width: 30,
  height: 30,
  zIndex: 20,
  color: theme.palette.text.secondary,
  '&:hover': {
    color: theme.palette.text.primary,
    backgroundColor: theme.palette.action.hover,
  },
}));

export function DialogCloseButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <CloseButton size="small" onClick={onClick} disabled={disabled} aria-label="بستن">
      <X size={18} />
    </CloseButton>
  );
}
