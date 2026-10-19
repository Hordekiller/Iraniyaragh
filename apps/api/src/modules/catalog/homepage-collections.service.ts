import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma, type HomepageCollectionConfig } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { HomepageCollectionSection, HomepageCollectionsConfig, HomepageCollectionsUpdate } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

const CONFIG_ID = 'storefront';
const MAX_SECTIONS = 8;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const EMPTY: HomepageCollectionSection[] = [];

function project(row: HomepageCollectionConfig | null): HomepageCollectionsConfig {
  return {
    version: row?.version ?? 0,
    sections: (row?.sections ?? EMPTY) as unknown as HomepageCollectionSection[],
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

function validate(input: HomepageCollectionsUpdate): HomepageCollectionSection[] {
  const sections = input?.sections;
  const valid = Number.isSafeInteger(input?.expectedVersion) && input.expectedVersion >= 0 && Array.isArray(sections) && sections.length <= MAX_SECTIONS &&
    sections.every(section => section && typeof section.categoryId === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(section.categoryId) &&
      (section.sortBy === 'NEWEST' || section.sortBy === 'BESTSELLING')) &&
    new Set(sections.map(section => section.categoryId)).size === sections.length;
  if (!valid) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'Choose up to eight unique categories with a supported sort order.' });
  return sections.map(section => ({ categoryId: section.categoryId, sortBy: section.sortBy }));
}

@Injectable()
export class HomepageCollectionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AuditLogService) private readonly audit: AuditLogService) {}

  async read(): Promise<HomepageCollectionsConfig> {
    const row = await this.prisma.homepageCollectionConfig.findUnique({ where: { id: CONFIG_ID } });
    return project(row);
  }

  async update(actorId: string, requestId: string, raw: HomepageCollectionsUpdate, idempotencyKey: string): Promise<HomepageCollectionsConfig> {
    const sections = validate(raw);
    const keyHash = digest(idempotencyKey);
    const payloadHash = digest(JSON.stringify({ expectedVersion: raw.expectedVersion, sections }));
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1752064112, 1935892595)`;
      const replay = await tx.homepageCollectionCommand.findUnique({ where: { actorId_keyHash: { actorId, keyHash } } });
      if (replay) {
        if (replay.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This retry key belongs to different homepage settings.' });
        return replay.response as unknown as HomepageCollectionsConfig;
      }

      const current = await tx.homepageCollectionConfig.findUnique({ where: { id: CONFIG_ID } });
      if ((current?.version ?? 0) !== raw.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'Homepage settings changed; reload before saving.' });
      if (sections.length) {
        const categories = await tx.category.findMany({ where: { id: { in: sections.map(section => section.categoryId) } }, select: { id: true } });
        if (categories.length !== sections.length) throw new BadRequestException({ code: 'INVALID_CATEGORY', message: 'One or more selected categories no longer exist.' });
      }
      const nextVersion = (current?.version ?? 0) + 1;
      const row = current
        ? await tx.homepageCollectionConfig.update({ where: { id: CONFIG_ID }, data: { version: nextVersion, sections: sections as unknown as Prisma.InputJsonValue } })
        : await tx.homepageCollectionConfig.create({ data: { id: CONFIG_ID, version: nextVersion, sections: sections as unknown as Prisma.InputJsonValue } });
      const result = project(row);
      await this.audit.record({ actorId, requestId, action: 'storefront.homepage_collections.updated', entityType: 'homepage_collection_config', entityId: CONFIG_ID,
        before: current ? project(current) : project(null), after: result }, tx);
      await tx.homepageCollectionCommand.create({ data: { actorId, keyHash, payloadHash, response: result as unknown as Prisma.InputJsonObject } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5000, maxWait: 2000 });
  }
}
