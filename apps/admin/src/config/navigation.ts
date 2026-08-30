import {
  Boxes,
  Building2,
  ClipboardCheck,
  CreditCard,
  FileClock,
  Gauge,
  PackageSearch,
  ReceiptText,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  status?: 'planned';
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export const navigation: NavigationGroup[] = [
  {
    label: 'نمای کلی',
    items: [{ label: 'داشبورد عملیات', href: '/dashboard', icon: Gauge }],
  },
  {
    label: 'فروش و مشتری',
    items: [
      { label: 'سفارش‌ها', href: '/orders', icon: ShoppingBag, permission: 'orders.read', status: 'planned' },
      { label: 'پرداخت‌ها', href: '/payments', icon: CreditCard, permission: 'payments.read', status: 'planned' },
      { label: 'مشتریان', href: '/customers', icon: Users, permission: 'customers.read', status: 'planned' },
      { label: 'ارسال‌ها', href: '/shipments', icon: Truck, permission: 'orders.read', status: 'planned' },
    ],
  },
  {
    label: 'کالا و انبار',
    items: [
      { label: 'کالا و SKU', href: '/catalog', icon: PackageSearch, permission: 'catalog.read', status: 'planned' },
      { label: 'انبارها', href: '/warehouses', icon: Building2, permission: 'inventory.read', status: 'planned' },
      { label: 'موجودی و گردش', href: '/inventory', icon: Boxes, permission: 'inventory.read', status: 'planned' },
      { label: 'انتقال‌ها', href: '/transfers', icon: ReceiptText, permission: 'inventory.transfer', status: 'planned' },
      { label: 'انبارگردانی', href: '/stocktakes', icon: ClipboardCheck, permission: 'inventory.adjust', status: 'planned' },
    ],
  },
  {
    label: 'سیستم',
    items: [
      { label: 'نقش‌ها و دسترسی', href: '/access', icon: ShieldCheck, permission: 'roles.manage', status: 'planned' },
      { label: 'گزارش ممیزی', href: '/audit', icon: FileClock, permission: 'audit.read', status: 'planned' },
      { label: 'تنظیمات', href: '/settings', icon: Settings2, permission: 'settings.manage', status: 'planned' },
    ],
  },
];
