import { BadRequestException, ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Prisma, type HomepageHeroConfig } from '@prisma/client';
import type { HomepageBannerImage, HomepageBannerInput, HomepageBannerMediaOption, HomepageBannersAdminConfig, HomepageBannersPublicConfig, HomepageBannersUpdate } from '@iranyaragh/contracts';
import type { EnvironmentVariables } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { widestRenditionProjection } from '../media/media-url';
import { isLive, validateBanners } from './homepage-banners.service';

const CONFIG_ID = 'storefront';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const BUILTINS: Record<string, { path: string; alt: string; name: string }> = {
  'cabinet-hinge-hero': { path: '/images/cabinet-hinge-hero.webp', alt: 'لولای کابینت', name: 'تصویر آماده: لولای کابینت' },
  'cabinet-drawer-hero': { path: '/images/cabinet-drawer-hero.webp', alt: 'ریل کشو', name: 'تصویر آماده: ریل کشو' },
  'cabinet-handle-hero': { path: '/images/cabinet-handle-hero.webp', alt: 'دستگیره کابینت', name: 'تصویر آماده: دستگیره کابینت' },
};
const DEFAULT_SLIDES: HomepageBannerInput[] = [
  { id: 'cabinet-hinge', title: 'لولا و یراق کابینت', subtitle: 'برای انتخاب دقیق یراق کابینت، کالاها و مشخصات ثبت‌شده را ببینید.', ctaLabel: 'مشاهده کالاها', href: '/search', desktopMediaId: 'cabinet-hinge-hero', mobileMediaId: null, imageAlt: 'لولای آرام‌بند روی درب کابینت چوبی', enabled: true, publishAt: null, unpublishAt: null },
  { id: 'cabinet-drawer', title: 'ریل کشو و حرکت نرم', subtitle: 'انواع ریل و تجهیزات کشو را در فروشگاه بررسی کنید.', ctaLabel: 'جستجوی ریل کشو', href: '/search?q=%D8%B1%DB%8C%D9%84%20%DA%A9%D8%B4%D9%88', desktopMediaId: 'cabinet-drawer-hero', mobileMediaId: null, imageAlt: 'ریل فلزی کشوی کابینت چوبی', enabled: true, publishAt: null, unpublishAt: null },
  { id: 'cabinet-handle', title: 'دستگیره‌های کابینت', subtitle: 'مدل‌های دستگیره را با تصاویر و مشخصات هر کالا مقایسه کنید.', ctaLabel: 'جستجوی دستگیره', href: '/search?q=%D8%AF%D8%B3%D8%AA%DA%AF%DB%8C%D8%B1%D9%87', desktopMediaId: 'cabinet-handle-hero', mobileMediaId: null, imageAlt: 'دستگیره‌های برنجی روی کشوهای کابینت چوبی', enabled: true, publishAt: null, unpublishAt: null },
];

@Injectable()
export class HomepageHeroService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Optional() @Inject(ConfigService) private readonly config?: ConfigService<EnvironmentVariables, true>) {}

  private get mediaOrigin() { return this.config?.get('PUBLIC_MEDIA_ORIGIN', { infer: true }) ?? 'http://localhost:9000/products'; }
  private builtinImage(id: string): HomepageBannerImage | undefined {
    const builtin = BUILTINS[id]; if (!builtin) return undefined;
    const origin = this.config?.get('STOREFRONT_ORIGIN', { infer: true }) ?? 'http://localhost:3000';
    return { url: new URL(builtin.path, origin).href, width: 1672, height: 941 };
  }
  private async images(ids: string[], client: Pick<PrismaService, 'productMedia'> = this.prisma) {
    const productIds = ids.filter(id => !BUILTINS[id]);
    const rows = productIds.length ? await client.productMedia.findMany({ where: { id: { in: productIds }, state: 'READY', kind: 'IMAGE' }, include: { renditions: true } }) : [];
    const map = new Map<string, HomepageBannerImage>();
    for (const id of ids) { const image = this.builtinImage(id); if (image) map.set(id, image); }
    for (const row of rows) { const image = widestRenditionProjection(this.mediaOrigin, row.renditions); if (image) map.set(row.id, image); }
    return map;
  }
  private async project(row: HomepageHeroConfig | null): Promise<HomepageBannersAdminConfig> {
    const stored = (row?.slides ?? DEFAULT_SLIDES) as unknown as HomepageBannerInput[];
    const images = await this.images(stored.flatMap(slide => slide.mobileMediaId ? [slide.desktopMediaId, slide.mobileMediaId] : [slide.desktopMediaId]));
    return { version: row?.version ?? 0, updatedAt: row?.updatedAt.toISOString() ?? null,
      banners: stored.map(slide => ({ ...slide, desktopImage: images.get(slide.desktopMediaId) ?? null, mobileImage: slide.mobileMediaId ? images.get(slide.mobileMediaId) ?? null : null })) };
  }
  async readAdmin() { return this.project(await this.prisma.homepageHeroConfig.findUnique({ where: { id: CONFIG_ID } })); }
  async readPublic(now = new Date()): Promise<HomepageBannersPublicConfig> {
    const { banners } = await this.readAdmin();
    return { banners: banners.flatMap(slide => !isLive(slide, now) || !slide.desktopImage ? [] : [{
      id: slide.id, title: slide.title, subtitle: slide.subtitle, ctaLabel: slide.ctaLabel, href: slide.href, imageAlt: slide.imageAlt,
      desktopImage: slide.desktopImage, mobileImage: slide.mobileImage,
    }]) };
  }
  async mediaOptions(): Promise<HomepageBannerMediaOption[]> {
    const rows = await this.prisma.productMedia.findMany({ where: { state: 'READY', kind: 'IMAGE' }, orderBy: { createdAt: 'desc' }, take: 60, include: { renditions: true, product: { select: { name: true } } } });
    return [
      ...Object.entries(BUILTINS).map(([id, builtin]) => ({ id, ...this.builtinImage(id)!, alt: builtin.alt, productName: builtin.name })),
      ...rows.flatMap(row => { const image = widestRenditionProjection(this.mediaOrigin, row.renditions); return image ? [{ id: row.id, ...image, alt: row.altText ?? '', productName: row.product.name }] : []; }),
    ];
  }
  async update(actorId: string, requestId: string, raw: HomepageBannersUpdate, idempotencyKey: string): Promise<HomepageBannersAdminConfig> {
    const slides = validateBanners(raw);
    const keyHash = digest(idempotencyKey);
    const payloadHash = digest(JSON.stringify({ expectedVersion: raw.expectedVersion, slides }));
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1752064113, 1935892599)`;
      const replay = await tx.homepageHeroCommand.findUnique({ where: { actorId_keyHash: { actorId, keyHash } } });
      if (replay) {
        if (replay.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Retry key belongs to different slides.' });
        return replay.response as unknown as HomepageBannersAdminConfig;
      }
      const current = await tx.homepageHeroConfig.findUnique({ where: { id: CONFIG_ID } });
      if ((current?.version ?? 0) !== raw.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'Hero slides changed; reload before saving.' });
      const ids = [...new Set(slides.flatMap(slide => slide.mobileMediaId ? [slide.desktopMediaId, slide.mobileMediaId] : [slide.desktopMediaId]))];
      const images = await this.images(ids, tx);
      if (ids.some(id => !images.has(id))) throw new BadRequestException({ code: 'INVALID_MEDIA', message: 'Every slide image must be ready.' });
      const before = await this.project(current);
      const version = (current?.version ?? 0) + 1;
      const row = current
        ? await tx.homepageHeroConfig.update({ where: { id: CONFIG_ID }, data: { version, slides: slides as unknown as Prisma.InputJsonValue } })
        : await tx.homepageHeroConfig.create({ data: { id: CONFIG_ID, version, slides: slides as unknown as Prisma.InputJsonValue } });
      const after = await this.project(row);
      await this.audit.record({ actorId, requestId, action: 'storefront.homepage_hero.updated', entityType: 'homepage_hero_config', entityId: CONFIG_ID, before, after }, tx);
      await tx.homepageHeroCommand.create({ data: { actorId, keyHash, payloadHash, response: after as unknown as Prisma.InputJsonObject } });
      return after;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5000, maxWait: 2000 });
  }
}
