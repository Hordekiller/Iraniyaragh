'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Pagination, Paper, Rating, Stack, TextField, Typography } from '@mui/material';
import type { AdminReviewSummary, ProductReviewStatus, ReviewModerationAction } from '@iranyaragh/contracts';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { ApiAbortError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canModerateReviews, canReadReviews } from '@/lib/reviews/review-permissions';
import { listReviews, moderateReview, newReviewCommandKey, replyToReview } from '@/lib/reviews/review-api';
import { REVIEW_STATUS_LABEL, REVIEW_STATUS_TONE, reviewErrorText } from '@/lib/reviews/review-labels';

const date = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' });
const ACTION_LABEL: Record<ReviewModerationAction, string> = { approve: 'تأیید و انتشار', reject: 'رد نظر', hide: 'پنهان‌کردن' };
type Dialogue = { kind: 'moderate'; action: ReviewModerationAction; review: AdminReviewSummary } | { kind: 'reply'; review: AdminReviewSummary } | null;

export function ReviewsView() {
  const { user, isRestoring } = useAuth();
  const [items, setItems] = useState<AdminReviewSummary[]>([]);
  const [pages, setPages] = useState(1);
  const [pending, setPending] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ProductReviewStatus | ''>('PENDING');
  const [rating, setRating] = useState<number | ''>('');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One retry key per unchanged command: a lost response retried with the same dialog, review version
  // and text replays the stored result instead of tripping STALE_VERSION on an already-applied change.
  const commandKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const canRead = canReadReviews(user);
  const canModerate = canModerateReviews(user);

  useEffect(() => { const timer = setTimeout(() => { setDebounced(query.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setLoading(true); setFailed(false);
    listReviews({ page, status: status || undefined, q: debounced || undefined, rating: rating || undefined }, controller.signal)
      .then(result => { setItems(result.items); setPages(result.meta.pages); setPending(result.pending); })
      .catch(cause => { if (!(cause instanceof ApiAbortError)) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canRead, page, status, rating, debounced, reload]);

  const open = useCallback((next: Dialogue) => {
    setDialogue(next); setError(null);
    setText(next?.kind === 'reply' ? next.review.staffReply ?? '' : '');
  }, []);

  async function submit() {
    if (!dialogue) return;
    setBusy(true); setError(null);
    const note = text.trim() || null;
    const command = dialogue.kind === 'moderate' ? dialogue.action : 'reply';
    const fingerprint = JSON.stringify([command, dialogue.review.id, dialogue.review.version, note]);
    if (commandKey.current?.fingerprint !== fingerprint) commandKey.current = { fingerprint, key: newReviewCommandKey(command) };
    const { key } = commandKey.current;
    try {
      if (dialogue.kind === 'moderate') await moderateReview(dialogue.review.id, { action: dialogue.action, expectedVersion: dialogue.review.version, note }, key);
      else await replyToReview(dialogue.review.id, { expectedVersion: dialogue.review.version, reply: note }, key);
      commandKey.current = null;
      setDialogue(null); setReload(n => n + 1);
    } catch (cause) { setError(reviewErrorText(cause)); } finally { setBusy(false); }
  }

  if (isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canRead) return <Alert severity="error">مجوز مشاهدهٔ نظرات لازم است.</Alert>;
  const needsNote = dialogue?.kind === 'moderate' && dialogue.action !== 'approve';
  return (
    <Box>
      <PageHeader title="نظرات مشتریان" description={`فقط خریداران واقعی (سفارش تحویل‌شده) می‌توانند نظر بدهند. نظر تا تأیید شما در سایت دیده نمی‌شود. ${pending ? `${pending.toLocaleString('fa-IR')} نظر منتظر بررسی است.` : ''}`} />
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mb: 2 }}>
        <TextField size="small" label="جستجو در متن یا نام کالا" value={query} onChange={event => setQuery(event.target.value)} sx={{ minWidth: 260 }} />
        <TextField select size="small" label="وضعیت" value={status} onChange={event => { setStatus(event.target.value as ProductReviewStatus | ''); setPage(1); }} sx={{ minWidth: 180 }}>
          <MenuItem value="">همه</MenuItem>
          {(Object.keys(REVIEW_STATUS_LABEL) as ProductReviewStatus[]).map(key => <MenuItem key={key} value={key}>{REVIEW_STATUS_LABEL[key]}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="امتیاز" value={rating} onChange={event => { setRating(event.target.value === '' ? '' : Number(event.target.value)); setPage(1); }} sx={{ minWidth: 120 }}>
          <MenuItem value="">همه</MenuItem>
          {[5, 4, 3, 2, 1].map(n => <MenuItem key={n} value={n}>{n.toLocaleString('fa-IR')} ستاره</MenuItem>)}
        </TextField>
      </Stack>
      {failed && <Alert severity="error" sx={{ mb: 2 }}>فهرست دریافت نشد؛ اتصال را بررسی و دوباره تلاش کنید.</Alert>}
      {!loading && !failed && items.length === 0 ? (
        <EmptyState title="نظری پیدا نشد" description={status === 'PENDING' && !debounced && !rating ? 'نظر بررسی‌نشده‌ای وجود ندارد.' : 'فیلترها را تغییر دهید.'} />
      ) : (
        <Stack gap={2} aria-busy={loading}>
          {items.map(review => (
            <Paper key={review.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
                <Rating value={review.rating} readOnly size="small" aria-label={`${review.rating.toLocaleString('fa-IR')} از ۵ ستاره`} />
                <StatusChip label={REVIEW_STATUS_LABEL[review.status]} tone={REVIEW_STATUS_TONE[review.status]} />
                <Typography variant="body2" color="text.secondary">{review.customerName} · {date.format(new Date(review.createdAt))}</Typography>
              </Stack>
              <Typography variant="subtitle2">{review.productName}</Typography>
              {review.title && <Typography fontWeight={700}>{review.title}</Typography>}
              <Typography sx={{ whiteSpace: 'pre-wrap', my: 1 }}>{review.body}</Typography>
              {review.moderationNote && <Typography variant="body2" color="text.secondary">یادداشت بررسی{review.moderatedByName ? ` (${review.moderatedByName})` : ''}: {review.moderationNote}</Typography>}
              {review.staffReply && <Alert severity="info" icon={false} sx={{ mt: 1 }}>پاسخ فروشگاه{review.staffRepliedByName ? ` (${review.staffRepliedByName})` : ''}: {review.staffReply}</Alert>}
              {canModerate && (
                <Stack direction="row" gap={1} sx={{ mt: 2 }} flexWrap="wrap">
                  {review.status !== 'APPROVED' && <Button size="small" variant="contained" onClick={() => open({ kind: 'moderate', action: 'approve', review })}>تأیید و انتشار</Button>}
                  {review.status === 'PENDING' && <Button size="small" color="error" variant="outlined" onClick={() => open({ kind: 'moderate', action: 'reject', review })}>رد</Button>}
                  {review.status === 'APPROVED' && <Button size="small" color="error" variant="outlined" onClick={() => open({ kind: 'moderate', action: 'hide', review })}>پنهان‌کردن</Button>}
                  {review.status === 'APPROVED' && <Button size="small" variant="outlined" onClick={() => open({ kind: 'reply', review })}>{review.staffReply ? 'ویرایش پاسخ' : 'پاسخ'}</Button>}
                </Stack>
              )}
            </Paper>
          ))}
          {pages > 1 && <Box sx={{ display: 'flex', justifyContent: 'center' }}><Pagination count={pages} page={page} onChange={(_event, next) => setPage(next)} /></Box>}
        </Stack>
      )}
      <Dialog open={dialogue !== null} onClose={() => !busy && setDialogue(null)} fullWidth maxWidth="sm">
        <DialogTitle>{dialogue?.kind === 'reply' ? 'پاسخ فروشگاه' : dialogue ? ACTION_LABEL[dialogue.action] : ''}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {dialogue?.kind === 'reply' && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>پاسخ زیر نظر مشتری در سایت نمایش داده می‌شود. خالی‌گذاشتن، پاسخ را حذف می‌کند.</Typography>}
          <TextField autoFocus fullWidth multiline minRows={3} margin="dense" value={text} onChange={event => setText(event.target.value)}
            label={dialogue?.kind === 'reply' ? 'متن پاسخ' : needsNote ? 'دلیل (برای مشتری نمایش داده می‌شود)' : 'یادداشت (اختیاری)'}
            slotProps={{ htmlInput: { maxLength: dialogue?.kind === 'reply' ? 1000 : 300 } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogue(null)} disabled={busy}>انصراف</Button>
          <Button variant="contained" onClick={() => void submit()} disabled={busy || (needsNote && text.trim().length < 3)}>{busy ? 'در حال ثبت…' : 'ثبت'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
