import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import { AuthPermissionService } from './auth-permission.service';

type Assignment = {
  role: {
    permissions: Array<{ permission: { key: string; isActive: boolean } }>;
  };
};

function createService(assignments: Assignment[]): {
  service: AuthPermissionService;
  findMany: ReturnType<typeof vi.fn>;
} {
  const findMany = vi.fn().mockResolvedValue(assignments);
  const prisma = { userRole: { findMany } } as unknown as PrismaService;
  return { service: new AuthPermissionService(prisma), findMany };
}

describe('AuthPermissionService effectivePermissionKeys', () => {
  it('aggregates and deduplicates active permission keys across roles', async () => {
    const { service, findMany } = createService([
      {
        role: {
          permissions: [
            { permission: { key: 'catalog.read', isActive: true } },
            { permission: { key: 'orders.read', isActive: true } },
          ],
        },
      },
      {
        role: {
          permissions: [
            { permission: { key: 'catalog.read', isActive: true } },
            { permission: { key: 'reports.read', isActive: true } },
          ],
        },
      },
    ]);

    await expect(service.effectivePermissionKeys('user-1')).resolves.toEqual(
      new Set(['catalog.read', 'orders.read', 'reports.read']),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          revokedAt: null,
          assignedAt: { lte: expect.any(Date) },
          role: {
            isActive: true,
          },
        }),
      }),
    );
  });

  it('returns an empty set when no active assignments exist', async () => {
    const { service } = createService([]);
    await expect(service.effectivePermissionKeys('user-1')).resolves.toEqual(new Set<string>());
  });

  it('ignores inactive permissions reported by the query', async () => {
    const { service } = createService([
      {
        role: {
          permissions: [
            { permission: { key: 'catalog.read', isActive: true } },
            { permission: { key: 'pricing.write', isActive: false } },
          ],
        },
      },
    ]);

    await expect(service.effectivePermissionKeys('user-1')).resolves.toEqual(new Set(['catalog.read']));
  });

  it('passes assignedAt <= now bound to exclude future-dated role assignments', async () => {
    const { service, findMany } = createService([]);
    await service.effectivePermissionKeys('user-1', new Date('2026-06-15T00:00:00Z'));

    const where = findMany.mock.calls[0][0].where;
    expect(where.assignedAt).toEqual({ lte: new Date('2026-06-15T00:00:00Z') });
  });

  it('passes grantedAt <= now bound to exclude future-dated role-permission grants', async () => {
    const { service, findMany } = createService([
      { role: { permissions: [{ permission: { key: 'admin.write', isActive: true } }] } },
    ]);
    await service.effectivePermissionKeys('user-1', new Date('2026-06-15T00:00:00Z'));

    const rolePermsSelect = findMany.mock.calls[0][0].select.role.select.permissions;
    expect(rolePermsSelect.where).toEqual({
      revokedAt: null,
      grantedAt: { lte: new Date('2026-06-15T00:00:00Z') },
    });
  });
});