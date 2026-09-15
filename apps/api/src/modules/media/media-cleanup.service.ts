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
    return { expired: expired.count, sources, archived };
  }
}
