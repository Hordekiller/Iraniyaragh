'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Paper, Stack, TextField, Typography, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import type { SearchAdminStatus, SearchAdminCommand } from '@iranyaragh/contracts';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
import { randomUuid } from '@/lib/crypto/random-uuid';

export function SearchManagementPage() {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!user?.permissions.includes('catalog.read')) return <Alert severity="error">مجوز مشاهدهٔ کاتالوگ لازم است.</Alert>;
  return <SearchEditor key={user.userId} canWrite={user.permissions.includes('catalog.write')} />;
}
function SearchEditor({canWrite}:{canWrite:boolean}) {
  const [data,setData]=useState<SearchAdminStatus|null>(null);
  const [revision,setRevision]=useState(0);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [term,setTerm]=useState(''); const [replacement,setReplacement]=useState('');
  const [productId,setProductId]=useState(''); const [keywords,setKeywords]=useState(''); const [boost,setBoost]=useState(0);
  useEffect(()=>{const c=new AbortController();apiFetch<SearchAdminStatus>('/search/admin',{token:getAccessToken(),signal:c.signal}).then(r=>setData(r.data)).catch(()=>{if(!c.signal.aborted)setError('دریافت وضعیت جستجو انجام نشد.');});return()=>c.abort();},[revision]);
  async function command(body:SearchAdminCommand) {
    setBusy(true);setError('');
    try {
      let cursor: string|null|undefined=body.cursor;
      do {
        const response: {data:{saved:boolean;nextCursor:string|null}}=await apiFetch<{saved:boolean;nextCursor:string|null}>('/search/admin',{token:getAccessToken(),method:'POST',headers:{'Idempotency-Key':randomUuid()},body:{...body,...(cursor?{cursor}:{})}});
        cursor=body.action==='reindex'?response.data.nextCursor:null;
      } while(cursor);
      setRevision(v=>v+1);
    } catch {setError('عملیات تأیید نشد. نشست تازه با تأیید دومرحله‌ای لازم است؛ وضعیت را بازخوانی و سپس دوباره بررسی کنید.');}
    finally{setBusy(false);}
  }
  return <Stack gap={3}>
    <PageHeader title="مدیریت جستجوی فروشگاه" description="کیفیت جستجو، واژه‌های تأییدشده و سلامت ایندکس کالاهای عمومی." breadcrumbs={[{label:'کاتالوگ',href:'/catalog'},{label:'جستجو'}]} />
    {error && <Alert severity="error">{error}</Alert>}
    <Button disabled={busy} onClick={()=>setRevision(v=>v+1)}>بازخوانی وضعیت</Button>
    {!data?<Typography role="status">در حال دریافت…</Typography>:<>
      <Paper variant="outlined" sx={{p:3}}><Stack gap={2}><Typography fontWeight={700}>سلامت جستجو</Typography><Typography>{data.products} کالا · {data.documents} تنوع · {data.missing} تنوع جاافتاده</Typography><Typography variant="body2">به‌روزرسانی ایندکس همراه با ثبت تغییر کالا انجام می‌شود. قیمت و موجودی هنگام پاسخ خوانده می‌شوند.</Typography>{canWrite && <Button disabled={busy} onClick={()=>void command({action:'reindex'})}>بازسازی و تطبیق ایندکس</Button>}</Stack></Paper>
      <Paper variant="outlined" sx={{p:3}}><Stack gap={2}><Typography fontWeight={700}>نام‌های جایگزین تأییدشده</Typography><Alert severity="info">فقط دو نام واقعاً هم‌معنا را ثبت کنید. نوع مکانیزم، کاربرد یا اندازهٔ متفاوت را هم‌معنا نکنید. عدد و کد مدل در این بخش پذیرفته نمی‌شود.</Alert>{data.aliases.map(a=><Stack key={a.term} direction="row" gap={2} alignItems="center"><Typography sx={{flex:1}}>{a.term} ← {a.replacement}</Typography>{canWrite&&<Button disabled={busy} color="error" onClick={()=>void command({action:'alias',term:a.term,remove:true})}>حذف</Button>}</Stack>)}{canWrite&&<><TextField label="نام جایگزین" value={term} onChange={e=>setTerm(e.target.value)} inputProps={{maxLength:60}}/><TextField label="نام معتبر کالا یا برند" value={replacement} onChange={e=>setReplacement(e.target.value)} inputProps={{maxLength:60}}/><Button disabled={busy||!term.trim()||!replacement.trim()} onClick={()=>void command({action:'alias',term,replacement})}>تأیید و ذخیرهٔ نام جایگزین</Button></>}</Stack></Paper>
      {canWrite&&<Paper variant="outlined" sx={{p:3}}><Stack gap={2}><Typography fontWeight={700}>واژه‌های مرتبط با یک کالا</Typography><TextField label="شناسهٔ کالا" value={productId} onChange={e=>setProductId(e.target.value)} /><TextField multiline label="واژه‌های تأییدشده" value={keywords} onChange={e=>setKeywords(e.target.value)} inputProps={{maxLength:500}}/><TextField type="number" label="اولویت بین نتایج هم‌سطح (۰ تا ۱۰)" value={boost} onChange={e=>setBoost(Number(e.target.value))} inputProps={{min:0,max:10}}/><Button disabled={busy||!productId.trim()} onClick={()=>void command({action:'keywords',productId,keywords,boost})}>ذخیرهٔ واژه‌ها</Button></Stack></Paper>}
      <Paper variant="outlined" sx={{p:3,overflowX:'auto'}}><Typography fontWeight={700}>آمار ۳۰ روز اخیر</Typography><Typography variant="body2" sx={{my:2}}>تعداد درخواست‌های پیشنهاد و کلیک روی کالاهای پیشنهادی؛ عبارت‌های خارج از واژه‌نامه به‌صورت «ناشناس» تجمیع می‌شوند. نرخ تبدیل خرید در این گزارش اندازه‌گیری نمی‌شود.</Typography><Table size="small"><TableHead><TableRow>{['عبارت','درخواست','بدون نتیجه','کلیک','نسبت کلیک به درخواست'].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{data.metrics.map(m=><TableRow key={m.query}><TableCell>{m.query==='[unrecognized]'?'عبارت ناشناس':m.query}</TableCell><TableCell>{m.searches}</TableCell><TableCell>{m.zeroResults}</TableCell><TableCell>{m.clicks}</TableCell><TableCell>{m.searches?`${(100*m.clicks/m.searches).toFixed(1)}٪`:'—'}</TableCell></TableRow>)}</TableBody></Table>{data.metrics.length===0&&<Typography sx={{mt:2}}>هنوز داده‌ای ثبت نشده است.</Typography>}</Paper>
    </>}
  </Stack>;
}
