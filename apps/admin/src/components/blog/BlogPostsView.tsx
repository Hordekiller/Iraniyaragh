'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, MenuItem, Pagination, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Plus } from 'lucide-react';
import type { BlogPostAdminSummary, BlogPostStatus } from '@iranyaragh/contracts';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError } from '@/lib/api/client';
import { canReadBlog, canWriteBlog } from '@/lib/blog/blog-permissions';
import { listBlogPosts } from '@/lib/blog/blog-api';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/blog/blog-labels';

const date = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' });

export function BlogPostsView() {
  const { user, isRestoring } = useAuth();
  const [items, setItems] = useState<BlogPostAdminSummary[]>([]);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<BlogPostStatus | ''>('');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const canRead = canReadBlog(user);

  useEffect(() => { const timer = setTimeout(() => { setDebounced(query.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setLoading(true); setFailed(false);
    listBlogPosts({ page, status: status || undefined, q: debounced || undefined }, controller.signal)
      .then(result => { setItems(result.items); setPages(result.meta.pages); })
      .catch(cause => { if (!(cause instanceof ApiAbortError)) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canRead, page, status, debounced]);

  if (isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canRead) return <Alert severity="error">مجوز مشاهدهٔ مقاله‌ها لازم است.</Alert>;
  return (
    <Box>
      <PageHeader title="مقالات وبلاگ" description="نوشتن، بازبینی و انتشار مقاله‌ها و راهنماهای فروشگاه. فقط مقالهٔ منتشرشده در سایت و نقشهٔ سایت (sitemap) دیده می‌شود."
        actions={canWriteBlog(user) ? <Button component={Link} href="/blog/new" variant="contained" startIcon={<Plus size={16} />}>مقالهٔ جدید</Button> : undefined} />
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mb: 2 }}>
        <TextField size="small" label="جستجوی عنوان یا نشانی" value={query} onChange={event => setQuery(event.target.value)} sx={{ minWidth: 260 }} />
        <TextField select size="small" label="وضعیت" value={status} onChange={event => { setStatus(event.target.value as BlogPostStatus | ''); setPage(1); }} sx={{ minWidth: 200 }}>
          <MenuItem value="">همه</MenuItem>
          {(Object.keys(STATUS_LABEL) as BlogPostStatus[]).map(key => <MenuItem key={key} value={key}>{STATUS_LABEL[key]}</MenuItem>)}
        </TextField>
      </Stack>
      {failed && <Alert severity="error" sx={{ mb: 2 }}>فهرست دریافت نشد؛ اتصال را بررسی و دوباره تلاش کنید.</Alert>}
      {!loading && !failed && items.length === 0 ? (
        <EmptyState title="مقاله‌ای پیدا نشد" description={status || debounced ? 'فیلترها را تغییر دهید.' : 'هنوز مقاله‌ای ثبت نشده است.'} />
      ) : (
        <Paper variant="outlined">
          <TableContainer>
            <Table size="small" aria-busy={loading} aria-label="فهرست مقاله‌ها">
              <TableHead><TableRow><TableCell>عنوان</TableCell><TableCell>وضعیت</TableCell><TableCell>نویسنده</TableCell><TableCell>انتشار</TableCell><TableCell>آخرین تغییر</TableCell></TableRow></TableHead>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id} hover>
                    <TableCell><Link href={`/blog/${encodeURIComponent(item.id)}`}>{item.title}</Link><Typography variant="caption" display="block" color="text.secondary" dir="ltr" sx={{ textAlign: 'right' }}>/blog/{item.slug}</Typography></TableCell>
                    <TableCell><StatusChip label={STATUS_LABEL[item.status]} tone={STATUS_TONE[item.status]} /></TableCell>
                    <TableCell>{item.authorName ?? '—'}</TableCell>
                    <TableCell>{item.publishedAt ? date.format(new Date(item.publishedAt)) : '—'}</TableCell>
                    <TableCell>{date.format(new Date(item.updatedAt))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {pages > 1 && <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}><Pagination count={pages} page={page} onChange={(_event, next) => setPage(next)} /></Box>}
        </Paper>
      )}
    </Box>
  );
}
