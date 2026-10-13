import { InvoiceDocumentPage } from '@/components/invoices/InvoiceDocumentPage';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <InvoiceDocumentPage id={id} />; }
