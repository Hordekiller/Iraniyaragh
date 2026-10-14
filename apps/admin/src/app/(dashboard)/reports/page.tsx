import { OperationalReportsPage } from '@/components/reports/OperationalReportsPage';
export default async function Page({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <OperationalReportsPage
      initialFilters={await searchParams}
      now={new Date().toISOString()}
    />
  );
}
