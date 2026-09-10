import { describe, expect, it } from 'vitest';
import { filterNavigationByPermissions, type NavigationGroup } from '../navigation';

const groups: NavigationGroup[] = [
  {
    label: 'عمومی',
    items: [{ label: 'داشبورد', href: '/dashboard', icon: {} as never }],
  },
  {
    label: 'عملیات',
    items: [
      { label: 'سفارش‌ها', href: '/orders', icon: {} as never, permission: 'orders.read' },
      { label: 'پرداخت‌ها', href: '/payments', icon: {} as never, permission: 'payments.read' },
    ],
  },
  {
    label: 'مدیریت',
    items: [{ label: 'نقش‌ها', href: '/access', icon: {} as never, permission: 'roles.manage' }],
  },
];

describe('filterNavigationByPermissions', () => {
  it('keeps open and granted entries while collapsing denied groups', () => {
    const result = filterNavigationByPermissions(groups, ['orders.read']);
    expect(result.map((group) => group.label)).toEqual(['عمومی', 'عملیات']);
    expect(result[1].items.map((item) => item.href)).toEqual(['/orders']);
  });

  it('fails closed for every gated entry when permissions are empty', () => {
    expect(filterNavigationByPermissions(groups, []).map((group) => group.label)).toEqual(['عمومی']);
  });

  it('does not mutate the shared navigation input', () => {
    const before = JSON.stringify(groups);
    filterNavigationByPermissions(groups, ['payments.read']);
    expect(JSON.stringify(groups)).toBe(before);
  });
});
