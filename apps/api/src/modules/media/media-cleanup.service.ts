import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PRODUCT_MEDIA_STORAGE, type ProductMediaStorage } from './storage.port';

const BATCH_SIZE = 100;
const ARCHIVED_RENDITION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class ProductMediaCleanupService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PRODUCT_MEDIA_STORAGE) private readonly storage: ProductMediaStorage,
  ) {}

  async sweep(now = new Date()): Promise<{ expired: number; sources: number; archived: number }> {
    const expired = await this.prisma.productMedia.updateMany({
      where: { state: 'PENDING_UPLOAD', uploadExpiresAt: { lte: now } },
      data: { state: 'FAILED', failureCode: 'MEDIA_UPLOAD_EXPIRED', sourceDeleteAt: now, version: { increment: 1 } },
    });

    const dueSources = await this.prisma.productMedia.findMany({
      where: { sourceDeleteAt: { lte: now } },
      orderBy: { sourceDeleteAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, objectKey: true, sourceDeleteAt: true },
    });
    let sources = 0;
    for (const media of dueSources) {
      await this.storage.deleteObject(media.objectKey);
      const cleared = await this.prisma.productMedia.updateMany({
        where: { id: media.id, sourceDeleteAt: media.sourceDeleteAt },
        data: { sourceDeleteAt: null },
      });
      sources += cleared.count;
    }

    const archivedBefore = new Date(now.getTime() - ARCHIVED_RENDITION_RETENTION_MS);
    const archivedMedia = await this.prisma.productMedia.findMany({
      where: { state: 'ARCHIVED', archivedAt: { lte: archivedBefore }, renditions: { some: {} } },
      orderBy: { archivedAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, renditions: { select: { objectKey: true } } },
    });
    let archived = 0;
    for (const media of archivedMedia) {
      for (const rendition of media.renditions) await this.storage.deleteObject(rendition.objectKey);
      const removed = await this.prisma.productMediaRendition.deleteMany({ where: { mediaId: media.id } });
      archived += removed.count;
    }
    // Storefront library orphans receive a long authoring grace period. The attach/archive
    // lock prevents a concurrent category or shop save from claiming an archived image.
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1752064113, 1935892600)`;
      const orphans = await tx.productMedia.findMany({
        where: { assetScope: 'STOREFRONT', state: 'READY', createdAt: { lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) }, categoryImages: { none: {} }, brandImages: { none: {} }, shopReferences: { none: {} }, blogPostCovers: { none: {} }, doorModels: { none: {} } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: BATCH_SIZE, select: { id: true },
      });
      if (orphans.length) {
        await tx.productMedia.updateMany({ where: { id: { in: orphans.map(row => row.id) } }, data: { state: 'ARCHIVED', archivedAt: now, sourceDeleteAt: now, version: { increment: 1 } } });
        await tx.auditLog.createMany({ data: orphans.map(row => ({ action: 'storefront.asset.orphan_archived', entityType: 'ProductMedia', entityId: row.id })) });
      }
    });
    return { expired: expired.count, sources, archived };
  }
}
