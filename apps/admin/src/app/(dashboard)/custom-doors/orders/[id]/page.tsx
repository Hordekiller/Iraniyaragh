import { DoorOrdersPanel } from '@/components/custom-doors/DoorOrdersPanel';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <DoorOrdersPanel id={id} />; }
