import { InvoiceDraftPage } from '@/components/invoices/InvoiceDraftPage';
export default async function InvoiceDraftRoute({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <InvoiceDraftPage id={id} />; }
