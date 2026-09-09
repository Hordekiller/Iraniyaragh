'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  InputAdornment,
  Typography,
} from '@mui/material';
import { CornerDownLeft, Search } from 'lucide-react';
import { navigation } from '@/config/navigation';
import styles from './GlobalSearch.module.css';

function flattenNavigation() {
  return navigation.flatMap((group) =>
    group.items.map((item) => ({ ...item, groupLabel: group.label })),
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fa');
    if (!q) return flattenNavigation();
    return flattenNavigation().filter(
      (item) =>
        item.label.toLocaleLowerCase('fa').includes(q) ||
        (item.groupLabel ?? '').toLocaleLowerCase('fa').includes(q),
    );
  }, [query]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function jumpTo(href: string) {
    router.push(href);
    close();
  }

  function handleFirstResult() {
    const first = results.find((item) => item.status !== 'planned');
    if (first) jumpTo(first.href);
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="جستجوی سریع در پنل"
        title="اجرای مرور سریع: Ctrl + K"
      >
        <span className={styles.icon}>
          <Search size={18} aria-hidden="true" />
        </span>
        <span className={styles.label}>جستجو در پنل…</span>
        <kbd className={styles.kbd}>Ctrl K</kbd>
      </button>

      <Dialog
        open={open}
        onClose={close}
        fullWidth
        maxWidth="sm"
        aria-labelledby="global-search-title"
      >
        <DialogTitle id="global-search-title" sx={{ typography: 'h6', fontWeight: 800 }}>
          جستجوی سریع
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <TextField
            inputRef={inputRef}
            fullWidth
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleFirstResult();
              if (event.key === 'Escape') close();
            }}
            placeholder="نام صفحه یا بخش را بنویسید…"
            size="small"
            inputProps={{ 'aria-label': 'عبارت جستجو' }}
            sx={{ p: 2, '.MuiOutlinedInput-root': { borderRadius: 3 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} />
                </InputAdornment>
              ),
            }}
          />
          <Box sx={{ maxHeight: 340, overflowY: 'auto' }}>
            <List dense disablePadding>
              {results.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 4, textAlign: 'center' }}>
                  نتیجه‌ای برای «{query}» یافت نشد.
                </Typography>
              ) : null}
              {results.map((item) => {
                const Icon = item.icon;
                const unavailable = item.status === 'planned';
                return (
                  <ListItemButton
                    key={item.href}
                    onClick={() => !unavailable && jumpTo(item.href)}
                    disabled={unavailable}
                    sx={{ '&.Mui-disabled': { opacity: 0.5 } }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Icon size={18} strokeWidth={1.8} />
                    </ListItemIcon>
                    <ListItemText primary={item.label} secondary={item.groupLabel} />
                    {unavailable ? (
                      <Typography variant="caption" color="text.secondary">
                        به‌زودی
                      </Typography>
                    ) : (
                      <CornerDownLeft size={15} aria-hidden="true" color="action.active" />
                    )}
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}