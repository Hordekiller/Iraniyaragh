import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma, type HomepageCollectionConfig } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { HomepageCollectionSection, HomepageCollectionSectionInput, HomepageCollectionsConfig, HomepageCollectionsUpdate } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

const CONFIG_ID = 'storefront';
const MAX_SECTIONS = 8;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const EMPTY: HomepageCollectionSection[] = [];

function project(row: HomepageCollectionConfig | null): HomepageCollectionsConfig {
  const storedSections = (row?.sections ?? EMPTY) as unknown as Array<Record<string, unknown>>;
  return {
    version: row?.version ?? 0,
    // Older configurations predate `kind`; keep them readable as category sections.
    sections: storedSections.map(section => section.kind === 'ALL_PRODUCTS'
      ? { kind: 'ALL_PRODUCTS', sortBy: section.sortBy as HomepageCollectionSection['sortBy'] }
      : { kind: 'CATEGORY', categoryId: String(section.categoryId ?? ''), sortBy: section.sortBy as HomepageCollectionSection['sortBy'] }),
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

function validate(input: HomepageCollectionsUpdate): HomepageCollectionSection[] {
  const sections = input?.sections;
  const valid = Number.isSafeInteger(input?.expectedVersion) && input.expectedVersion >= 0 && Array.isArray(sections) && sections.length <= MAX_SECTIONS &&
    sections.every(section => {
      if (!section || (section.sortBy !== 'NEWEST' && section.sortBy !== 'BESTSELLING')) return false;
      const kind = section.kind ?? 'CATEGORY'; // Accept the previous category-only request shape.
      if (kind === 'ALL_PRODUCTS') return section.categoryId === undefined;
      return kind === 'CATEGORY' && typeof section.categoryId === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(section.categoryId);
    }) &&
    new Set(sections.map(section => section.kind === 'ALL_PRODUCTS' ? `ALL_PRODUCTS:${section.sortBy}` : `CATEGORY:${section.categoryId}`)).size === sections.length;
  if (!valid) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'Choose up to eight unique categories with a supported sort order.' });
  return (sections as HomepageCollectionSectionInput[]).map(section => section.kind === 'ALL_PRODUCTS'
    ? { kind: 'ALL_PRODUCTS', sortBy: section.sortBy }
    : { kind: 'CATEGORY', categoryId: section.categoryId!, sortBy: section.sortBy });
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
    // Preserve the pre-kind canonical payload so an in-flight category retry
    // can still reconcile after this version is deployed.
    const payloadSections = sections.map(section => section.kind === 'ALL_PRODUCTS'
      ? section
      : { categoryId: section.categoryId, sortBy: section.sortBy });
    const payloadHash = digest(JSON.stringify({ expectedVersion: raw.expectedVersion, sections: payloadSections }));
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1752064112, 1935892595)`;
      const replay = await tx.homepageCollectionCommand.findUnique({ where: { actorId_keyHash: { actorId, keyHash } } });
      if (replay) {
        if (replay.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This retry key belongs to different homepage settings.' });
        return replay.response as unknown as HomepageCollectionsConfig;
      }

      const current = await tx.homepageCollectionConfig.findUnique({ where: { id: CONFIG_ID } });
      if ((current?.version ?? 0) !== raw.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'Homepage settings changed; reload before saving.' });
      const categoryIds = sections.flatMap(section => section.kind !== 'ALL_PRODUCTS' ? [section.categoryId] : []);
      if (categoryIds.length) {
        const categories = await tx.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true } });
        if (categories.length !== categoryIds.length) throw new BadRequestException({ code: 'INVALID_CATEGORY', message: 'One or more selected categories no longer exist.' });
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
