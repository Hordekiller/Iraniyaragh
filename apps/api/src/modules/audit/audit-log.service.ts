import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuditLogEntry, AuditLogListResponse } from '@iranyaragh/contracts';
import type { AuditLogListQueryDto } from './audit.dto';

export type AuditEventInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  actorId?: string | null;
  requestId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditEventInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: input.before ?? Prisma.JsonNull,
        after: input.after ?? Prisma.JsonNull,
        metadata: input.metadata ?? Prisma.JsonNull,
        requestId: input.requestId ?? null,
        ipHash: input.ipHash ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async list(query: AuditLogListQueryDto): Promise<AuditLogListResponse> {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.actorId) where.actorId = query.actorId;
    if (query.createdFrom || query.createdToExclusive) {
      where.createdAt = {};
      if (query.createdFrom) where.createdAt.gte = new Date(query.createdFrom);
      if (query.createdToExclusive) where.createdAt.lt = new Date(query.createdToExclusive);
    }

    const [rows, count] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        include: { actor: { select: { id: true, mobile: true, firstName: true, lastName: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const items: AuditLogEntry[] = rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      actorLabel: row.actor
        ? [row.actor.firstName, row.actor.lastName].filter(Boolean).join(' ') || row.actor.mobile || row.actor.id
        : null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      before: row.before,
      after: row.after,
      metadata: row.metadata,
      requestId: row.requestId,
      ipHash: row.ipHash,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
    }));

    return { items, count };
  }
}