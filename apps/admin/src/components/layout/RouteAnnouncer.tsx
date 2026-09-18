'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { navigation } from '@/config/navigation';

function routeLabel(pathname: string): string {
  const item = navigation
    .flatMap((group) => group.items)
    .filter((candidate) =>
      pathname === candidate.href || pathname.startsWith(`${candidate.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];

  return item?.label ?? 'صفحه پنل عملیات';
}
export function RouteAnnouncer() {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    setAnnouncement(`صفحه ${routeLabel(pathname)} باز شد`);
  }, [pathname]);

  return (
    <span className="srOnly" role="status" aria-live="polite" aria-atomic="true">
      {announcement}
    </span>
  );
}
