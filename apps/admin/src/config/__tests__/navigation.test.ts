import { describe, expect, it } from 'vitest';
import { filterNavigationByPermissions, type NavigationGroup } from '../navigation';

const groups: NavigationGroup[] = [
  {
    label: 'open',
    items: [{ label: 'داشبورد', href: '/dashboard', icon: {} as never }],
  },
  {
    label: 'mixed',
    items: [
      { label: 'گزارش‌ها', href: '/reports', icon: {} as never, permission: 'reports.read', status: 'planned' },
      { label: 'ممیزی', href: '/audit', icon: {} as never, permission: 'audit.read', status: 'planned' },
    ],
  },
  {
    label: 'locked',
    items: [{ label: 'نقش‌ها', href: '/access', icon: {} as never, permission: 'roles.manage', status: 'planned' }],
  },
];

describe('filterNavigationByPermissions', () => {
  it('keeps permission-less items and drops every group the principal cannot see', () => {
    const result = filterNavigationByPermissions(groups, ['reports.read']);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('open');
    expect(result[1].label).toBe('mixed');
    expect(result[1].items.map(item => item.href)).toEqual(['/reports']);
  });

  it('hides the whole navigation when no permission matches', () => {
    const result = filterNavigationByPermissions(groups, []);
    expect(result.map(group => group.label)).toEqual(['open']);
  });

  it('reveals planned entries only for granted permissions', () => {
    const result = filterNavigationByPermissions(groups, ['audit.read', 'roles.manage']);
    const mixed = result.find(group => group.label === 'mixed');
    expect(mixed?.items.map(item => item.href)).toEqual(['/audit']);
    expect(result.some(group => group.label === 'locked')).toBe(true);
  });

  it('does not mutate the input groups', () => {
    const before = JSON.stringify(groups);
    filterNavigationByPermissions(groups, []);
    expect(JSON.stringify(groups)).toBe(before);
  });
});