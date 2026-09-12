'use client';

import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductCreateForm } from '@/components/catalog/ProductCreateForm';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canReadCatalog, canWriteCatalog } from '@/lib/catalog/catalog-permissions';

export default function NewProductPage() {
  const { user } = useAuth();
  if (!canReadCatalog(user)) {
    return <EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="حساب شما برای ساخت کالا مجوز مشاهدهٔ کاتالوگ ندارد." />;
  }
  if (!canWriteCatalog(user)) {
    return <EmptyState icon={<Lock size={28} />} title="دسترسی ایجاد کالا ندارید" description="حساب شما فقط اجازهٔ خواندن کاتالوگ را دارد." />;
  }
  return <ProductCreateForm />;
}
