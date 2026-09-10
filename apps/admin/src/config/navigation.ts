import {
  Boxes,
  Building2,
  ClipboardCheck,
  CreditCard,
  FileClock,
  Gauge,
  PackageSearch,
  ChartNoAxesCombined,
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

/**
 * Returns the navigation groups visible to a principal: an item is shown when
 * it declares no permission or the principal holds that permission; a group
 * whose items are all filtered out is hidden entirely. Planned entries obey the
 * same rule (they are only rendered as disabled placeholders when permitted).
 */
export function filterNavigationByPermissions(
  groups: readonly NavigationGroup[],
  permissions: readonly string[],
): NavigationGroup[] {
  const allowed = new Set(permissions);
  const result: NavigationGroup[] = [];
  for (const group of groups) {
    const items = group.items.filter(
      item => item.permission === undefined || allowed.has(item.permission),
    );
    if (items.length > 0) {
      result.push({ ...group, items });
    }
  }
  return result;
}

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
      { label: 'ارسال‌ها', href: '/shipments', icon: Truck, permission: 'shipments.read', status: 'planned' },
    ],
  },
  {
    label: 'گزارش‌ها',
    items: [
      {
        label: 'گزارش‌های عملیاتی',
        href: '/reports',
        icon: ChartNoAxesCombined,
        permission: 'reports.read',
        status: 'planned',
      },
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
