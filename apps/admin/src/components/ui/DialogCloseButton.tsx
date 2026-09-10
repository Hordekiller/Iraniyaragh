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

export function DialogCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <CloseButton size="small" onClick={onClick} aria-label="بستن">
      <X size={18} />
    </CloseButton>
  );
}
