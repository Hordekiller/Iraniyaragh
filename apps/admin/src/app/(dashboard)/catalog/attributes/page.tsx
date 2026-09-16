'use client';

import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { AttributesView } from '@/components/catalog/AttributesView';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canReadCatalog } from '@/lib/catalog/catalog-permissions';

export default function AttributesPage() {
  const { user } = useAuth();
  if (!canReadCatalog(user)) {
    return (
      <EmptyState
        icon={<Lock size={28} />}
        title="دسترسی ندارید"
        description="حساب شما برای مشاهدهٔ کاتالوگ مجوز ندارد."
      />
    );
  }
  return <AttributesView />;
}