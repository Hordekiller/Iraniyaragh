'use client';

import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { CatalogImportView } from '@/components/catalog/CatalogImportView';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canReadCatalog, canWriteCatalog } from '@/lib/catalog/catalog-permissions';

export default function CatalogImportPage() {
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
  if (!canWriteCatalog(user)) {
    return (
      <EmptyState
        icon={<Lock size={28} />}
        title="دسترسی واردات ندارید"
        description="حساب شما فقط اجازهٔ خواندن کاتالوگ را دارد."
      />
    );
  }
  return <CatalogImportView />;
}