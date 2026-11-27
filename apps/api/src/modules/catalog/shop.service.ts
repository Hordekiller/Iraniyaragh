import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { ShopAdminConfig, ShopContent, ShopPublicConfig, ShopUpdate, HomepageBannerInput } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { getRequestId } from '../../common/request-context';
import { CatalogIdempotencyService } from './catalog-idempotency.service';
import { isLive, validateBanners } from './homepage-banners.service';
import { widestRenditionProjection } from '../media/media-url';

export const DEFAULT_SHOP_CONTENT: ShopContent = {
  hero: [], banners: [], categoryIds: [], brandIds: [],
  sections: [
    ['categories', 'دسته‌بندی کالاها'], ['offers', 'پیشنهادهای ویژه'], ['bestsellers', 'پرفروش‌ها'], ['newest', 'تازه رسیده‌ها'], ['brands', 'خرید بر پایهٔ برند'], ['campaigns', 'جشنواره‌های فعال'], ['recent', 'بازدیدهای اخیر شما'],
  ].map(([kind, title]) => ({ id: kind!, kind: kind as ShopContent['sections'][number]['kind'], title: title!, description: '', enabled: true, limit: 8, categoryId: null, productIds: [] })),
};
@Injectable()
export class ShopService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CatalogIdempotencyService) private readonly idempotency: CatalogIdempotencyService, @Inject(AuditLogService) private readonly audit: AuditLogService, @Inject(ConfigService) private readonly config: ConfigService) {}
  async readAdmin(): Promise<ShopAdminConfig> {
    const row = await this.prisma.shopConfig.findUnique({ where: { id: 'shop' } });
    return { ...(row ? row.content as unknown as ShopContent : DEFAULT_SHOP_CONTENT), version: row?.version ?? 0, updatedAt: row?.updatedAt.toISOString() ?? null };
  }
  async readPublic(): Promise<ShopPublicConfig> {
    const { hero, banners, sections, categoryIds, brandIds } = await this.readAdmin();
    const now = new Date();
    const ids = [...new Set([...hero, ...banners].filter(b => isLive(b, now)).flatMap(b => [b.desktopMediaId, ...(b.mobileMediaId ? [b.mobileMediaId] : [])]))];
    const rows = ids.length ? await this.prisma.productMedia.findMany({ where: { id: { in: ids }, assetScope: 'STOREFRONT', state: 'READY', kind: 'IMAGE' }, include: { renditions: true } }) : [];
    const images = new Map(rows.map(row => [row.id, widestRenditionProjection(this.config.get<string>('PUBLIC_MEDIA_ORIGIN') ?? 'http://localhost:9000/products', row.renditions)]));
    const project = (items: HomepageBannerInput[]) => items.flatMap(b => {
      const desktopImage = images.get(b.desktopMediaId);
      return isLive(b, now) && desktopImage ? [{ id: b.id, title: b.title, subtitle: b.subtitle, ctaLabel: b.ctaLabel, href: b.href, imageAlt: b.imageAlt, desktopImage, mobileImage: b.mobileMediaId ? images.get(b.mobileMediaId) ?? null : null }] : [];
    });
    return { hero: project(hero), banners: project(banners), sections: sections.filter(s => s.enabled), categoryIds, brandIds };
  }
  async update(actorId: string, key: string, input: ShopUpdate): Promise<ShopAdminConfig> {
    const hero = validateBanners({ expectedVersion: input.expectedVersion, banners: input.hero });
    const banners = validateBanners({ expectedVersion: input.expectedVersion, banners: input.banners });
    const sections = input.sections;
    if (new Set(sections.map(s => s.id)).size !== sections.length || sections.some(s => !/^[a-zA-Z0-9_-]{1,64}$/u.test(s.id) || !s.title.trim() || (s.kind === 'category' && !s.categoryId))) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Section identifiers, titles or categories are invalid.' });
    const content: ShopContent = { hero, banners, sections, categoryIds: [...new Set(input.categoryIds)], brandIds: [...new Set(input.brandIds)] };
    return this.idempotency.run({ actorId, scope: 'storefront.shop.update', key, payload: input, execute: async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1752064113, 1935892600)`;
      const current = await tx.shopConfig.findUnique({ where: { id: 'shop' } });
      if ((current?.version ?? 0) !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'Shop settings changed. Reload before saving.' });
      const categoryIds = [...new Set([...content.categoryIds, ...sections.flatMap(s => s.categoryId ? [s.categoryId] : [])])];
      const productIds = [...new Set(sections.flatMap(s => s.productIds))];
      const mediaIds = [...new Set([...hero, ...banners].flatMap(b => [b.desktopMediaId, ...(b.mobileMediaId ? [b.mobileMediaId] : [])]))];
      const counts = await Promise.all([
        tx.category.count({ where: { id: { in: categoryIds } } }), tx.brand.count({ where: { id: { in: content.brandIds } } }),
        tx.product.count({ where: { id: { in: productIds }, status: 'ACTIVE' } }), tx.productMedia.count({ where: { id: { in: mediaIds }, assetScope: 'STOREFRONT', state: 'READY', kind: 'IMAGE' } }),
      ]);
      if (counts.some((count, i) => count !== [categoryIds, content.brandIds, productIds, mediaIds][i]!.length)) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: 'A selected catalog item or image is unavailable.' });
      const row = await tx.shopConfig.upsert({ where: { id: 'shop' }, create: { id: 'shop', version: 1, content: content as unknown as Prisma.InputJsonObject }, update: { version: { increment: 1 }, content: content as unknown as Prisma.InputJsonObject } });
      await tx.shopAssetReference.deleteMany({ where: { configId: 'shop' } });
      if (mediaIds.length) await tx.shopAssetReference.createMany({ data: mediaIds.map(mediaId => ({ configId: 'shop', mediaId })) });
      await this.audit.record({ actorId, requestId: getRequestId(), action: 'storefront.shop.updated', entityType: 'ShopConfig', entityId: 'shop', before: { version: current?.version ?? 0 }, after: { version: row.version, sectionCount: sections.length } }, tx);
      return { response: { ...content, version: row.version, updatedAt: row.updatedAt.toISOString() }, resourceId: 'shop', resourceType: 'ShopConfig' };
    } });
  }
}
