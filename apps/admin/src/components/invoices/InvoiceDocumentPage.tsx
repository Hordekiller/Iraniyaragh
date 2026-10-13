'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import type { InvoiceDocument, InvoiceDocumentListResponse } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { hasPermission } from '@/lib/settings/settings-permissions';
import { ApiAbortError } from '@/lib/api/client';
import { formatRial } from '@/lib/orders/orders-labels';
import { listInvoiceDocuments, readInvoiceDocument } from '@/lib/invoices/invoice-documents-api';
import { invoiceDocumentError } from './InvoiceIssue';
import { PageHeader } from '@/components/ui/PageHeader';
export function InvoiceDocumentPage({ id }: { id?: string }) {
  const {user,isRestoring}=useAuth();
  if(isRestoring)return <Typography role="status">در حال بررسی نشست…</Typography>;
  if(!hasPermission(user,'invoices.read'))return <Alert severity="error">دسترسی مشاهدهٔ فاکتور لازم است.</Alert>;
  return <Documents key={`${user?.userId}:${id??'list'}`} id={id}/>;
}
function Documents({id}:{id?:string}) {
  const [document,setDocument]=useState<InvoiceDocument>();const [list,setList]=useState<InvoiceDocumentListResponse['data']>();
  const [offset,setOffset]=useState(0);const [retry,setRetry]=useState(0);const [loading,setLoading]=useState(true);const [error,setError]=useState<unknown>();
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
      <Paper sx={{p:3}}><Stack spacing={1}><Typography variant="h6">{document.seller.name}</Typography><Typography>{document.seller.address}</Typography><Typography>{document.seller.contact}</Typography>
        <Typography>شماره: {document.number} — زمان صدور: {new Date(document.issuedAt).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'})}</Typography>
        <Typography>خریدار: {document.buyerLabel}</Typography><Typography>نشانی صورتحساب: {document.address.city}، {document.address.address} — کد پستی {document.address.postalCode}</Typography>
        <Typography>گیرنده: {document.address.recipient} — تلفن {document.address.mobile}</Typography>
        <Typography>سفارش مبنا: <Link href={`/orders/${encodeURIComponent(document.orderId)}`}>{document.orderId}</Link></Typography>
        <Typography>روش تحویل: {document.shipping.title}</Typography>{document.note&&<Typography>{document.note}</Typography>}
      </Stack></Paper>
      <Paper sx={{overflowX:'auto'}}><Table aria-label="اقلام فاکتور صادرشده"><TableHead><TableRow>{['کد کالا','شرح','تعداد','قیمت واحد (ریال)','تخفیف (ریال)','مالیات (ریال)','جمع (ریال)'].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
        <TableBody>{document.lines.map(line=><TableRow key={line.orderItemId}><TableCell>{line.sku}</TableCell><TableCell>{line.title}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{formatRial(line.unitPrice)}</TableCell><TableCell>{formatRial(line.discount)}</TableCell><TableCell>{formatRial(line.tax)}</TableCell><TableCell>{formatRial(line.total)}</TableCell></TableRow>)}</TableBody></Table></Paper>
      <Paper sx={{p:3}}><Stack spacing={1}><Typography>جمع اقلام: {formatRial(document.quote.subtotal)}</Typography><Typography>تخفیف: {formatRial(document.quote.discount)}</Typography>
        <Typography>ارسال: {formatRial(document.quote.shipping)}</Typography><Typography>مالیات: {formatRial(document.quote.tax)}</Typography><Typography variant="h6">مبلغ نهایی: {formatRial(document.quote.total)}</Typography>
        <Typography>سیاست مالی نسخهٔ {document.policyVersion}؛ {document.taxPolicy.treatment === 'EXEMPT' ? `معاف: ${document.taxPolicy.exemptionReason}` : document.taxPolicy.treatment === 'INCLUSIVE' ? 'مالیات در مبلغ منظور شده است' : 'مالیات جدا از مبلغ پایه'}.</Typography>
      </Stack></Paper>
      <Alert severity="info">این سند از اطلاعات ثبت‌شدهٔ زمان صدور نمایش داده می‌شود. برای وضعیت پرداخت و وصول، جزئیات سفارش و دفترکل را بررسی کنید.</Alert>
    </>}
    {!id&&list&&<Paper sx={{p:2}}>{list.count===0?<Typography>هنوز فاکتوری صادر نشده است.</Typography>:list.items.map(item=><Box key={item.id} sx={{py:1}}><Link href={`/invoices/documents/${encodeURIComponent(item.id)}`}>{item.number} — {item.buyerLabel} — {formatRial(item.total)}</Link></Box>)}
      <Button disabled={loading||offset===0} onClick={()=>setOffset(value=>Math.max(0,value-25))}>صفحهٔ قبل</Button><Button disabled={loading||offset+25>=list.count} onClick={()=>setOffset(value=>value+25)}>صفحهٔ بعد</Button></Paper>}
  </Stack>;
}
