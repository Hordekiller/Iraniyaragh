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
          role: { isActive: true },
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
});