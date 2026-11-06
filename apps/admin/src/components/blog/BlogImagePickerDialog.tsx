'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, ImageList, ImageListItem, Stack, TextField, Typography } from '@mui/material';
import type { BlogMediaOption } from '@iranyaragh/contracts';
import { EmptyState } from '@/components/ui/EmptyState';
import type { MediaPickerItem } from '@/lib/editor/media-picker';

/**
 * Two steps: pick a ready product image, then write the alt text (required, specific to this
 * article) and an optional visible caption. The server also refuses an image with no alt.
 */
export function BlogImagePickerDialog({ open, options, onInsert, onCancel }: { open: boolean; options: BlogMediaOption[]; onInsert: (item: MediaPickerItem) => void; onCancel: () => void }) {
  const [chosen, setChosen] = useState<BlogMediaOption | null>(null);
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  useEffect(() => { if (!open) { setChosen(null); setAlt(''); setCaption(''); } }, [open]);

  const choose = (option: BlogMediaOption) => { setChosen(option); setAlt(option.alt); setCaption(''); };
  const insert = () => {
    if (!chosen || !alt.trim()) return;
    onInsert({ id: chosen.id, url: chosen.url, alt: alt.trim(), caption: caption.trim() || null, width: chosen.width, height: chosen.height });
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="md" aria-labelledby="blog-image-picker-title">
      <DialogTitle id="blog-image-picker-title">درج تصویر در مقاله</DialogTitle>
      <DialogContent>
        {chosen ? (
          <Stack gap={2} sx={{ pt: 1 }}>
            <Box component="img" src={chosen.url} alt="" sx={{ maxHeight: 240, maxWidth: '100%', objectFit: 'contain', alignSelf: 'center', borderRadius: 1 }} />
            <TextField label="متن جایگزین تصویر (alt)" required autoFocus value={alt} onChange={event => setAlt(event.target.value)} inputProps={{ maxLength: 200 }}
              error={!alt.trim()} helperText={alt.trim() ? `${alt.length}/200 — بگویید در تصویر چه می‌بینید، برای همین مقاله.` : 'متن جایگزین الزامی است.'} />
            <TextField label="عنوان زیر تصویر (اختیاری)" value={caption} onChange={event => setCaption(event.target.value)} inputProps={{ maxLength: 200 }} helperText="به‌صورت figcaption زیر تصویر نمایش داده می‌شود." />
          </Stack>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>فقط تصویرهای آمادهٔ کالاها.</Typography>
            {options.length === 0 ? <EmptyState title="تصویر آماده‌ای وجود ندارد" description="ابتدا برای یک کالا تصویر بارگذاری و پردازش شود." /> : (
              <ImageList cols={4} gap={12}>
                {options.map(option => (
                  <ImageListItem key={option.id}>
                    <Box component="button" type="button" aria-label={`انتخاب تصویر ${option.alt || option.productName}`} onClick={() => choose(option)}
                      sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 0, bgcolor: 'background.paper', cursor: 'pointer', overflow: 'hidden' }}>
                      <Box component="img" src={option.url} alt="" loading="lazy" sx={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
                      <Typography variant="caption" sx={{ display: 'block', p: 0.5 }}>{option.productName}</Typography>
                    </Box>
                  </ImageListItem>
                ))}
              </ImageList>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {chosen && <Button onClick={() => setChosen(null)}>تغییر تصویر</Button>}
        <Button onClick={onCancel}>انصراف</Button>
        {chosen && <Button variant="contained" disabled={!alt.trim()} onClick={insert}>درج در مقاله</Button>}
      </DialogActions>
    </Dialog>
  );
}
