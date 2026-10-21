import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma, type HomepageCollectionConfig } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { HomepageCollectionSection, HomepageCollectionsConfig, HomepageCollectionsUpdate } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

const CONFIG_ID = 'storefront';
const SECTION_COUNT = 5;
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
  const valid = Number.isSafeInteger(input?.expectedVersion) && input.expectedVersion >= 0 && Array.isArray(sections) && sections.length === SECTION_COUNT &&
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
    const categories = await this.prisma.category.findMany({
      select: { id: true, name: true, slug: true, parentId: true, _count: { select: { products: true } } },
    });
    const byId = new Map(categories.map(category => [category.id, category]));
    const rootIdFor = (categoryId: string): string | null => {
      let cursor = byId.get(categoryId);
      const seen = new Set<string>();
      while (cursor?.parentId) {
        if (seen.has(cursor.id)) return null;
        seen.add(cursor.id);
        cursor = byId.get(cursor.parentId);
      }
      return cursor?.id ?? null;
    };
    const roots = categories.filter(category => category.parentId === null);
    const counts = new Map(roots.map(category => [category.id, 0]));
    for (const category of categories) {
      const rootId = rootIdFor(category.id);
      if (rootId) counts.set(rootId, (counts.get(rootId) ?? 0) + category._count.products);
    }

    const chosen: HomepageCollectionSection[] = [];
    const selected = new Set<string>();
    const configured = (row?.sections ?? EMPTY) as unknown as HomepageCollectionSection[];
    for (const section of configured) {
      if (!section || typeof section.categoryId !== 'string' || (section.sortBy !== 'NEWEST' && section.sortBy !== 'BESTSELLING')) continue;
      const rootId = rootIdFor(section.categoryId);
      if (!rootId || selected.has(rootId)) continue;
      selected.add(rootId);
      chosen.push({ categoryId: rootId, sortBy: section.sortBy });
      if (chosen.length === SECTION_COUNT) break;
    }
    const candidates = [...roots].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'fa') || a.id.localeCompare(b.id));
    for (const category of candidates) {
      if (chosen.length === SECTION_COUNT) break;
      if (selected.has(category.id)) continue;
      selected.add(category.id);
      chosen.push({ categoryId: category.id, sortBy: 'NEWEST' });
    }
    return { ...project(row), sections: chosen };
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
      const categories = await tx.category.findMany({ where: { id: { in: sections.map(section => section.categoryId) } }, select: { id: true, parentId: true } });
      if (categories.length !== SECTION_COUNT || categories.some(category => category.parentId !== null)) throw new BadRequestException({ code: 'INVALID_CATEGORY', message: 'Choose five existing parent categories.' });
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
