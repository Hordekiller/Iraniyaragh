'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Divider, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import type { BlogMediaOption, BlogPostAdmin, BlogPostInput, BlogRevisionSummary, BlogTransitionAction } from '@iranyaragh/contracts';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { BlogImagePickerDialog } from './BlogImagePickerDialog';
import type { MediaPickerRequest } from '@/lib/editor/media-picker';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError } from '@/lib/api/client';
import { canPublishBlog, canReadBlog, canWriteBlog } from '@/lib/blog/blog-permissions';
import { createBlogPost, newBlogCommandKey, readBlogMedia, readBlogPost, readBlogRevisions, transitionBlogPost, updateBlogPost } from '@/lib/blog/blog-api';
import { STATUS_LABEL, STATUS_TONE, blogErrorText, suggestSlug } from '@/lib/blog/blog-labels';

const EMPTY: BlogPostInput = { slug: '', title: '', excerpt: '', bodyHtml: '', coverMediaId: null, coverAlt: null, tags: [], seoTitle: null, seoDescription: null, sources: [] };
const MIN_TEXT = 300;
const MIN_EXCERPT = 50;
const when = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' });
const toInput = (post: BlogPostAdmin): BlogPostInput => ({ slug: post.slug, title: post.title, excerpt: post.excerpt, bodyHtml: post.bodyHtml, coverMediaId: post.coverMediaId, coverAlt: post.coverAlt, tags: post.tags, seoTitle: post.seoTitle, seoDescription: post.seoDescription, sources: post.sources });
const textLength = (html: string) => html.replace(/<style[\s\S]*?<\/style>/giu, ' ').replace(/<[^>]+>/gu, ' ').replace(/&nbsp;/gu, ' ').replace(/\s+/gu, ' ').trim().length;
const localToIso = (value: string) => (value ? new Date(value).toISOString() : null);

export function BlogEditor({ postId }: { postId: string | null }) {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canReadBlog(user)) return <Alert severity="error">مجوز مشاهدهٔ مقاله‌ها لازم است.</Alert>;
  return <Editor key={`${user?.userId}:${postId ?? 'new'}`} postId={postId} />;
}

function Editor({ postId }: { postId: string | null }) {
  const router = useRouter();
  const { user } = useAuth();
  const canWrite = canWriteBlog(user);
  const canPublish = canPublishBlog(user);
  const [post, setPost] = useState<BlogPostAdmin | null>(null);
  const [form, setForm] = useState<BlogPostInput>(EMPTY);
  const [saved, setSaved] = useState<BlogPostInput>(EMPTY);
  const [media, setMedia] = useState<BlogMediaOption[]>([]);
  const [revisions, setRevisions] = useState<BlogRevisionSummary[]>([]);
  const [tagText, setTagText] = useState('');
  const [slugTouched, setSlugTouched] = useState(postId !== null);
  const [publishAt, setPublishAt] = useState('');
  const [loading, setLoading] = useState(postId !== null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<MediaPickerRequest | null>(null);
  const openPicker = useCallback((request: MediaPickerRequest) => setPicker(request), []);
  // The editor's picker contract is product-scoped; articles use the shared ready-image library instead.
  const mediaPicker = useMemo(() => (canWrite ? { productId: 'blog', open: openPicker } : undefined), [canWrite, openPicker]);
  // Same payload retried after an uncertain network failure reuses its key (idempotent); a changed payload gets a new one.
  const keyRef = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (canWrite) readBlogMedia(controller.signal).then(setMedia).catch(() => undefined);
    if (postId) {
      Promise.all([readBlogPost(postId, controller.signal), readBlogRevisions(postId, controller.signal)])
        .then(([loaded, history]) => { setPost(loaded); setForm(toInput(loaded)); setSaved(toInput(loaded)); setTagText(loaded.tags.join('، ')); setRevisions(history); })
        .catch(cause => { if (!(cause instanceof ApiAbortError)) setLoadError(cause); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }
    return () => controller.abort();
  }, [postId, canWrite]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const status = post?.status ?? 'DRAFT';
  const editable = canWrite && (status === 'DRAFT' || status === 'IN_REVIEW' || canPublish);
  const change = (patch: Partial<BlogPostInput>) => { setForm(current => ({ ...current, ...patch })); setNotice(null); setError(null); };
  const parsedTags = () => tagText.split(/[،,]/u).map(tag => tag.trim()).filter(Boolean);
  const current = (): BlogPostInput => ({ ...form, tags: parsedTags(), seoTitle: form.seoTitle?.trim() || null, seoDescription: form.seoDescription?.trim() || null, coverAlt: form.coverMediaId ? form.coverAlt : null });

  const checklist = [
    { ok: textLength(form.bodyHtml) >= MIN_TEXT, text: `متن مقاله دست‌کم ${MIN_TEXT} نویسه (اکنون ${textLength(form.bodyHtml)})` },
    { ok: form.excerpt.trim().length >= MIN_EXCERPT, text: `خلاصهٔ پاسخ‌محور دست‌کم ${MIN_EXCERPT} نویسه (اکنون ${form.excerpt.trim().length})` },
    { ok: !form.coverMediaId || Boolean(form.coverAlt?.trim()), text: 'تصویر شاخص متن جایگزین (alt) دارد' },
    { ok: Boolean(form.slug), text: 'نشانی (slug) مشخص است' },
    { ok: !form.seoTitle || form.seoTitle.length <= 70, text: 'عنوان سئو حداکثر ۷۰ نویسه' },
  ];

  async function run(work: (key: string, input: BlogPostInput) => Promise<BlogPostAdmin>, label: string, afterNew?: boolean) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    const input = current();
    const signature = JSON.stringify({ label, input, version: post?.version });
    if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: newBlogCommandKey(label) };
    try {
      const result = await work(keyRef.current.key, input);
      keyRef.current = null;
      setPost(result); setForm(toInput(result)); setSaved(toInput(result)); setTagText(result.tags.join('، '));
      if (postId) readBlogRevisions(postId).then(setRevisions).catch(() => undefined);
      setNotice(`${label} انجام شد.`);
      if (afterNew) router.replace(`/blog/${encodeURIComponent(result.id)}`);
    } catch (cause) {
      setError(cause);
    } finally { setBusy(false); }
  }

  const save = () => run((key, input) => (post ? updateBlogPost(post.id, post.version, input, key) : createBlogPost(input, key)), post ? 'ذخیره' : 'ایجاد پیش‌نویس', !post);
  const move = (action: BlogTransitionAction, label: string) => run((key) => transitionBlogPost(post!.id, { action, expectedVersion: post!.version, ...(action === 'publish' ? { publishAt: localToIso(publishAt) } : {}) }, key), label);

  if (loading) return <Typography role="status">در حال دریافت مقاله…</Typography>;
  if (loadError) return <Alert severity="error">{blogErrorText(loadError)}</Alert>;
  const isAuthor = post?.authorId === user?.userId;

  return (
    <Box>
      <PageHeader title={post ? post.title || 'مقالهٔ بدون عنوان' : 'مقالهٔ جدید'} breadcrumbs={[{ label: 'مقالات وبلاگ', href: '/blog' }, { label: post ? 'ویرایش' : 'جدید' }]}
        actions={post ? <StatusChip label={STATUS_LABEL[post.status]} tone={STATUS_TONE[post.status]} /> : undefined} />
      {error != null && <Alert severity="error" sx={{ mb: 2 }}>{blogErrorText(error)}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} role="status">{notice}</Alert>}
      {post?.selfReviewed && <Alert severity="warning" sx={{ mb: 2 }}>این مقاله را نویسنده خودش تأیید و منتشر کرده است (بدون بازبین مستقل).</Alert>}
      <Stack direction={{ xs: 'column', lg: 'row' }} gap={3} alignItems="flex-start">
        <Stack gap={2} sx={{ flex: 1, minWidth: 0, width: '100%' }} component="form" onSubmit={event => { event.preventDefault(); if (editable) void save(); }}>
          <TextField label="عنوان" required value={form.title} disabled={!editable} inputProps={{ maxLength: 160 }} helperText={`${form.title.length}/160 — عنوان صفحه (h1)`}
            onChange={event => change({ title: event.target.value, ...(slugTouched ? {} : { slug: suggestSlug(event.target.value) }) })} />
          <TextField label="نشانی (slug)" required value={form.slug} disabled={!editable} inputProps={{ dir: 'ltr', maxLength: 250 }}
            helperText={post && post.status !== 'DRAFT' ? 'تغییر نشانی یک تغییر مسیر دائمی (۳۰۸) از نشانی قبلی می‌سازد.' : 'حروف کوچک لاتین یا فارسی، عدد و خط تیره.'}
            onChange={event => { setSlugTouched(true); change({ slug: event.target.value }); }} />
          <TextField label="خلاصهٔ پاسخ‌محور" required multiline minRows={3} value={form.excerpt} disabled={!editable} inputProps={{ maxLength: 400 }}
            helperText={`${form.excerpt.length}/400 — در فهرست، اشتراک‌گذاری و موتورهای پاسخ نمایش داده می‌شود؛ پاسخ اصلی مقاله را در همین چند جمله بدهید.`} onChange={event => change({ excerpt: event.target.value })} />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>متن مقاله</Typography>
            <RichTextEditor value={form.bodyHtml} onChange={html => change({ bodyHtml: html })} disabled={!editable} height={420} ariaLabel="ویرایشگر متن مقاله" mediaPicker={mediaPicker} variant="article" onError={setError} />
            <Typography variant="caption" color="text.secondary">عنوان‌ها را از «سطح ۲» شروع کنید (h1 همان عنوان صفحه است). تصویر داخل متن را با دکمهٔ تصویر ویرایشگر درج کنید (حداکثر ۲۰ تصویر)؛ هر تصویر باید متن جایگزین (alt) داشته باشد.</Typography>
          </Box>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>تصویر شاخص</Typography>
            <Stack gap={2}>
              <TextField select size="small" label="تصویر" value={form.coverMediaId ?? ''} disabled={!editable} onChange={event => change({ coverMediaId: event.target.value || null, coverAlt: event.target.value ? form.coverAlt : null })}>
                <MenuItem value="">بدون تصویر شاخص</MenuItem>
                {form.coverMediaId && !media.some(option => option.id === form.coverMediaId) && <MenuItem value={form.coverMediaId}>تصویر فعلی</MenuItem>}
                {media.map(option => <MenuItem key={option.id} value={option.id}><Stack direction="row" gap={1} alignItems="center"><Box component="img" src={option.url} alt="" sx={{ width: 48, height: 32, objectFit: 'cover', borderRadius: 0.5 }} /><span>{option.productName}{option.alt ? ` — ${option.alt}` : ''}</span></Stack></MenuItem>)}
              </TextField>
              {form.coverMediaId && <TextField size="small" label="متن جایگزین تصویر (alt)" required value={form.coverAlt ?? ''} disabled={!editable} inputProps={{ maxLength: 200 }} onChange={event => change({ coverAlt: event.target.value })} />}
            </Stack>
          </Paper>
          <TextField label="برچسب‌ها" value={tagText} disabled={!editable} helperText="با ویرگول جدا کنید؛ حداکثر ۸ برچسب. برچسب‌ها صفحهٔ جدا نمی‌سازند (برای جلوگیری از محتوای کم‌ارزش)." onChange={event => { setTagText(event.target.value); setNotice(null); }} />
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>سئو</Typography>
            <Stack gap={2}>
              <TextField size="small" label="عنوان سئو (اختیاری)" value={form.seoTitle ?? ''} disabled={!editable} inputProps={{ maxLength: 70 }} helperText={`${(form.seoTitle ?? '').length}/70 — خالی یعنی عنوان مقاله`} onChange={event => change({ seoTitle: event.target.value })} />
              <TextField size="small" label="توضیح سئو (اختیاری)" multiline minRows={2} value={form.seoDescription ?? ''} disabled={!editable} inputProps={{ maxLength: 200 }} helperText={`${(form.seoDescription ?? '').length}/200 — خالی یعنی خلاصهٔ مقاله`} onChange={event => change({ seoDescription: event.target.value })} />
              <Box aria-label="پیش‌نمایش نتیجهٔ جستجو" sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary" dir="ltr" display="block" sx={{ textAlign: 'right' }}>/blog/{form.slug || '…'}</Typography>
                <Typography color="primary" fontWeight={700}>{(form.seoTitle || form.title || 'عنوان مقاله')} | ایرانی یراق</Typography>
                <Typography variant="body2">{form.seoDescription || form.excerpt || 'توضیح مقاله'}</Typography>
              </Box>
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">منابع (برای ادعاهای فنی، استاندارد و سازگاری)</Typography>
              <Button size="small" startIcon={<Plus size={14} />} disabled={!editable || form.sources.length >= 10} onClick={() => change({ sources: [...form.sources, { title: '', url: '', accessedAt: new Date().toISOString().slice(0, 10) }] })}>افزودن منبع</Button>
            </Stack>
            <Stack gap={1.5}>
              {form.sources.map((source, index) => (
                <Stack key={index} direction={{ xs: 'column', md: 'row' }} gap={1} alignItems="center">
                  <TextField size="small" fullWidth label="عنوان منبع" value={source.title} disabled={!editable} onChange={event => change({ sources: form.sources.map((item, i) => (i === index ? { ...item, title: event.target.value } : item)) })} />
                  <TextField size="small" fullWidth label="نشانی (https)" placeholder="نشانی کامل منبع با https" value={source.url} disabled={!editable} inputProps={{ dir: 'ltr' }} onChange={event => change({ sources: form.sources.map((item, i) => (i === index ? { ...item, url: event.target.value } : item)) })} />
                  <TextField size="small" label="تاریخ بازدید" type="date" value={source.accessedAt} disabled={!editable} InputLabelProps={{ shrink: true }} onChange={event => change({ sources: form.sources.map((item, i) => (i === index ? { ...item, accessedAt: event.target.value } : item)) })} />
                  <Button size="small" color="error" aria-label="حذف منبع" disabled={!editable} onClick={() => change({ sources: form.sources.filter((_item, i) => i !== index) })}><Trash2 size={16} /></Button>
                </Stack>
              ))}
            </Stack>
          </Paper>
          {editable && <Stack direction="row" gap={2}><Button type="submit" variant="contained" disabled={busy || !dirty && Boolean(post)}>{busy ? 'در حال ذخیره…' : post ? 'ذخیرهٔ تغییرات' : 'ایجاد پیش‌نویس'}</Button>{dirty && post && <Typography variant="body2" color="warning.main" alignSelf="center">تغییرات ذخیره‌نشده</Typography>}</Stack>}
        </Stack>

        <Stack gap={2} sx={{ width: { xs: '100%', lg: 340 }, flexShrink: 0 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>آمادگی انتشار</Typography>
            <Stack component="ul" gap={0.5} sx={{ m: 0, pl: 0, listStyle: 'none' }}>
              {checklist.map(item => <Typography key={item.text} component="li" variant="body2" color={item.ok ? 'success.main' : 'text.secondary'}>{item.ok ? '✓' : '○'} {item.text}</Typography>)}
            </Stack>
          </Paper>
          {post && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>گردش کار</Typography>
              {dirty && <Alert severity="info" sx={{ mb: 1 }}>پیش از تغییر وضعیت، تغییرات را ذخیره کنید.</Alert>}
              <Stack gap={1}>
                {status === 'DRAFT' && canWrite && <Button variant="outlined" disabled={busy || dirty} onClick={() => void move('submit', 'ارسال برای بازبینی')}>ارسال برای بازبینی</Button>}
                {status === 'IN_REVIEW' && canPublish && <Button variant="outlined" disabled={busy || dirty} onClick={() => void move('return-to-draft', 'بازگشت به پیش‌نویس')}>بازگشت به پیش‌نویس</Button>}
                {canPublish && status !== 'PUBLISHED' && (
                  <>
                    <TextField size="small" type="datetime-local" label="زمان‌بندی انتشار (اختیاری)" InputLabelProps={{ shrink: true }} value={publishAt} onChange={event => setPublishAt(event.target.value)} helperText="خالی یعنی همین حالا." />
                    {isAuthor && <Alert severity="warning">شما نویسندهٔ این مقاله‌اید؛ انتشار به‌عنوان «تأیید بدون بازبین مستقل» ثبت می‌شود.</Alert>}
                    <Button variant="contained" disabled={busy || dirty || checklist.some(item => !item.ok)} onClick={() => void move('publish', status === 'ARCHIVED' ? 'بازگردانی و انتشار' : 'انتشار')}>{status === 'ARCHIVED' ? 'بازگردانی و انتشار' : 'انتشار'}</Button>
                  </>
                )}
                {canPublish && status === 'PUBLISHED' && <Button variant="outlined" disabled={busy || dirty} onClick={() => void move('unpublish', 'خارج‌کردن از انتشار')}>خارج‌کردن از انتشار</Button>}
                {canPublish && status !== 'ARCHIVED' && <Button color="error" variant="outlined" disabled={busy || dirty} onClick={() => void move('archive', 'بایگانی')}>بایگانی</Button>}
                {!canPublish && status !== 'DRAFT' && <Typography variant="body2" color="text.secondary">انتشار و بایگانی به مجوز «انتشار مقاله» نیاز دارد.</Typography>}
                {status === 'PUBLISHED' && <Button component="a" href={`/blog/${encodeURIComponent(post.slug)}`} target="_blank" rel="noopener noreferrer">مشاهدهٔ مقاله در سایت</Button>}
              </Stack>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" color="text.secondary" component="div">نویسنده: {post.authorName ?? '—'}</Typography>
              <Typography variant="caption" color="text.secondary" component="div">تأییدکننده: {post.reviewerName ?? '—'}</Typography>
              {post.publishedAt && <Typography variant="caption" color="text.secondary" component="div">زمان انتشار: {when.format(new Date(post.publishedAt))}</Typography>}
              <Typography variant="caption" color="text.secondary" component="div">آخرین تغییر محتوا: {when.format(new Date(post.contentUpdatedAt))}</Typography>
            </Paper>
          )}
          {revisions.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>تاریخچهٔ نسخه‌ها</Typography>
              <Stack component="ol" gap={0.5} sx={{ m: 0, pl: 2 }}>
                {revisions.map(revision => <Typography key={revision.version} component="li" variant="caption">نسخهٔ {revision.version} — {STATUS_LABEL[revision.status]} — {when.format(new Date(revision.createdAt))}{revision.actorName ? ` — ${revision.actorName}` : ''}</Typography>)}
              </Stack>
            </Paper>
          )}
        </Stack>
      </Stack>
      <BlogImagePickerDialog open={picker !== null} options={media} onCancel={() => { picker?.onCancel(); setPicker(null); }} onInsert={item => { picker?.onInsert(item); setPicker(null); }} />
    </Box>
  );
}
