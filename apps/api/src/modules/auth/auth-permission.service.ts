import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AuthPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async effectivePermissionKeys(userId: string, now: Date = new Date()): Promise<ReadonlySet<string>> {
    const assignments = await this.prisma.userRole.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        role: { isActive: true },
      },
      select: {
        role: {
          select: {
            permissions: {
              where: { revokedAt: null },
              select: {
                permission: { select: { key: true, isActive: true } },
              },
            },
          },
        },
      },
    });

    const keys = new Set<string>();
    for (const assignment of assignments) {
      for (const grant of assignment.role.permissions) {
        if (grant.permission.isActive) keys.add(grant.permission.key);
      }
    }
    return keys;
  }
}