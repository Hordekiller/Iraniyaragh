'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import type { InvoiceDocument, InvoiceDocumentListResponse, Money } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { hasPermission } from '@/lib/settings/settings-permissions';
import { ApiAbortError } from '@/lib/api/client';
import { formatRial } from '@/lib/orders/orders-labels';
import { listInvoiceDocuments, readInvoiceDocument } from '@/lib/invoices/invoice-documents-api';
import { invoiceDocumentError } from './InvoiceIssue';
import { PageHeader } from '@/components/ui/PageHeader';
import { InvoicePublication } from './InvoicePublication';
import { InvoicePdfActions } from './InvoicePdfActions';
import { brandAsset } from '@/lib/brand';
import { prepareInvoicePrint } from '@/lib/invoices/invoice-print';
import printStyles from './InvoicePrint.module.css';
const invoiceAmount = (value: Money) => <span className={printStyles.money} dir="ltr">{formatRial(value).replace(/ ریال$/u, '')}</span>;
export function InvoiceDocumentPage({ id }: { id?: string }) {
  const {user,isRestoring}=useAuth();
  if(isRestoring)return <Typography role="status">در حال بررسی نشست…</Typography>;
  if(!hasPermission(user,'invoices.read'))return <Alert severity="error">دسترسی مشاهدهٔ فاکتور لازم است.</Alert>;
  return <Documents key={`${user?.userId}:${id??'list'}`} id={id}/>;
}
function Documents({id}:{id?:string}) {
  const [document,setDocument]=useState<InvoiceDocument>();const [list,setList]=useState<InvoiceDocumentListResponse['data']>();
  const [offset,setOffset]=useState(0);const [retry,setRetry]=useState(0);const [loading,setLoading]=useState(true);const [error,setError]=useState<unknown>();
  const sheet = useRef<HTMLElement | null>(null); const printing = useRef(false);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [printBusy, setPrintBusy] = useState(false); const [printError, setPrintError] = useState(false);
  async function printInvoice() {
    const current = sheet.current; if (!current || printing.current) return;
    printing.current = true; setPrintBusy(true); setPrintError(false);
    try { await prepareInvoicePrint(current); if (current.isConnected && sheet.current === current) window.print(); }
    catch { if (alive.current) setPrintError(true); }
    finally { printing.current = false; if (alive.current) setPrintBusy(false); }
  }
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError(undefined);setDocument(undefined);setList(undefined);
    void (async()=>{try{if(id){const result=await readInvoiceDocument(id,controller.signal);if(!controller.signal.aborted)setDocument(result);}
      else{const result=await listInvoiceDocuments(offset,controller.signal);if(!controller.signal.aborted)setList(result);}}
      catch(cause){if(!controller.signal.aborted&&!(cause instanceof ApiAbortError))setError(cause);}finally{if(!controller.signal.aborted)setLoading(false);}})();
    return()=>controller.abort();},[id,offset,retry]);
  return <Stack spacing={3}><PageHeader title={document?`فاکتور ${document.number}`:'فاکتورهای صادرشده'} description="اسناد فروشگاهی تغییرناپذیر؛ صدور سند به معنای وصول وجه نیست."/>
    <Button component={Link} href="/invoices" sx={{alignSelf:'start'}}>پیش‌فاکتورها</Button>
    {loading&&<Typography role="status">در حال دریافت فاکتور…</Typography>}
    {error!==undefined&&<Alert severity="error">{invoiceDocumentError(error)}</Alert>}
    <Button disabled={loading} onClick={()=>setRetry(value=>value+1)}>بازخوانی فاکتور</Button>
    {document&&<>
      <Button onClick={() => void printInvoice()} disabled={printBusy}>چاپ فاکتور A4</Button>
      {printError && <Alert severity="error">لوگو یا قلم چاپ دریافت نشد؛ اتصال را بررسی و چاپ را دوباره امتحان کنید.</Alert>}
      <Stack component="article" ref={sheet} spacing={3} className={printStyles.sheet} data-invoice-print aria-label={`سند فاکتور ${document.number}`}>
      <Image className={printStyles.brand} src={brandAsset('wordmark-print.png')} alt="ایرانی یراق" width={1086} height={362} unoptimized />
      <Paper sx={{p:3}}><Stack spacing={1}><Typography variant="h6">فاکتور فروشگاهی</Typography><Typography variant="h6">{document.seller.name}</Typography><Typography>{document.seller.address}</Typography><Typography>{document.seller.contact}</Typography>
        <Typography>شماره: {document.number} — زمان صدور: {new Date(document.issuedAt).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'})}</Typography>
        <Typography>خریدار: {document.buyerLabel}</Typography><Typography>نشانی صورتحساب: {document.address.city}، {document.address.address} — کد پستی {document.address.postalCode}</Typography>
        <Typography>گیرنده: {document.address.recipient} — تلفن {document.address.mobile}</Typography>
        <Typography className={printStyles.screenOnly}>سفارش مبنا: <Link href={`/orders/${encodeURIComponent(document.orderId)}`}>{document.orderId}</Link></Typography>
        <Typography>روش تحویل: {document.shipping.title}</Typography>{document.note&&<Typography className={printStyles.screenOnly}>{document.note}</Typography>}
      </Stack></Paper>
      <Paper sx={{overflowX:'auto'}}><Table aria-label="اقلام فاکتور صادرشده"><TableHead><TableRow>{['کد کالا','شرح','تعداد','قیمت واحد (ریال)','تخفیف (ریال)','مالیات (ریال)','جمع (ریال)'].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
        <TableBody>{document.lines.map(line=><TableRow key={line.orderItemId}><TableCell>{line.sku}</TableCell><TableCell>{line.title}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{invoiceAmount(line.unitPrice)}</TableCell><TableCell>{invoiceAmount(line.discount)}</TableCell><TableCell>{invoiceAmount(line.tax)}</TableCell><TableCell>{invoiceAmount(line.total)}</TableCell></TableRow>)}</TableBody></Table></Paper>
      <Paper sx={{p:3}}><Stack spacing={1}><Typography>جمع اقلام: {formatRial(document.quote.subtotal)}</Typography><Typography>تخفیف: {formatRial(document.quote.discount)}</Typography>
        <Typography>ارسال: {formatRial(document.quote.shipping)}</Typography><Typography>مالیات: {formatRial(document.quote.tax)}</Typography><Typography variant="h6">مبلغ نهایی: {formatRial(document.quote.total)}</Typography>
        <Typography>سیاست مالی نسخهٔ {document.policyVersion}؛ {document.taxPolicy.treatment === 'EXEMPT' ? `معاف: ${document.taxPolicy.exemptionReason}` : document.taxPolicy.treatment === 'INCLUSIVE' ? 'مالیات در مبلغ منظور شده است' : 'مالیات جدا از مبلغ پایه'}.</Typography>
      </Stack></Paper>
      <Alert severity="info">این سند از اطلاعات ثبت‌شدهٔ زمان صدور نمایش داده می‌شود. برای وضعیت پرداخت و وصول، جزئیات سفارش و دفترکل را بررسی کنید.</Alert>
      <Typography className={printStyles.pageFooter}>{document.number} — فاکتور فروشگاهی ایرانی یراق — واحد مبالغ: ریال</Typography>
      </Stack>
      <InvoicePublication id={document.id}/>
      <InvoicePdfActions id={document.id} number={document.number}/>
    </>}
    {!id&&list&&<Paper sx={{p:2}}>{list.count===0?<Typography>هنوز فاکتوری صادر نشده است.</Typography>:list.items.map(item=><Box key={item.id} sx={{py:1}}><Link href={`/invoices/documents/${encodeURIComponent(item.id)}`}>{item.number} — {item.buyerLabel} — {formatRial(item.total)}</Link></Box>)}
      <Button disabled={loading||offset===0} onClick={()=>setOffset(value=>Math.max(0,value-25))}>صفحهٔ قبل</Button><Button disabled={loading||offset+25>=list.count} onClick={()=>setOffset(value=>value+25)}>صفحهٔ بعد</Button></Paper>}
  </Stack>;
}
