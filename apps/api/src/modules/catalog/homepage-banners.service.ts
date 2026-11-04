import { BadRequestException, ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type HomepageBannerConfig } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  HOMEPAGE_BANNER_SLOTS,
  type HomepageBannerAdmin, type HomepageBannerImage, type HomepageBannerInput, type HomepageBannerMediaOption,
  type HomepageBannersAdminConfig, type HomepageBannersPublicConfig, type HomepageBannersUpdate,
} from '@iranyaragh/contracts';
import type { EnvironmentVariables } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { widestRenditionProjection } from '../media/media-url';

const CONFIG_ID = 'storefront';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const ID = /^[A-Za-z0-9_-]{1,64}$/u;
const MEDIA_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export function isSafeBannerHref(href: string): boolean {
  if (href.length > 500 || /[\s\\]/u.test(href) || [...href].some(ch => ch.charCodeAt(0) < 32)) return false;
  if (href.startsWith('/')) return !href.startsWith('//');
  try { return new URL(href).protocol === 'https:'; } catch { return false; }
}

const text = (value: unknown, max: number, min = 0): value is string => typeof value === 'string' && value.trim().length >= min && value.length <= max;
const date = (value: unknown): value is string | null => value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));

export function validateBanners(input: HomepageBannersUpdate): HomepageBannerInput[] {
  const banners = input?.banners;
  const ok = Number.isSafeInteger(input?.expectedVersion) && input.expectedVersion >= 0 && Array.isArray(banners) && banners.length <= HOMEPAGE_BANNER_SLOTS &&
    new Set(banners.map(b => b?.id)).size === banners.length &&
    banners.every(b => b && typeof b.id === 'string' && ID.test(b.id) && text(b.title, 80, 1) && (b.subtitle === null || text(b.subtitle, 160)) &&
      text(b.ctaLabel, 40, 1) && typeof b.href === 'string' && isSafeBannerHref(b.href) && typeof b.desktopMediaId === 'string' && MEDIA_ID.test(b.desktopMediaId) &&
      (b.mobileMediaId === null || (typeof b.mobileMediaId === 'string' && MEDIA_ID.test(b.mobileMediaId))) && text(b.imageAlt, 200, 1) &&
      typeof b.enabled === 'boolean' && date(b.publishAt) && date(b.unpublishAt) &&
      !(b.publishAt && b.unpublishAt && Date.parse(b.unpublishAt) <= Date.parse(b.publishAt)));
  if (!ok) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'Banner fields are incomplete, unsafe or exceed four slots.' });
  return banners.map(b => ({
    id: b.id, title: b.title.trim(), subtitle: b.subtitle?.trim() || null, ctaLabel: b.ctaLabel.trim(), href: b.href, desktopMediaId: b.desktopMediaId,
    mobileMediaId: b.mobileMediaId, imageAlt: b.imageAlt.trim(), enabled: b.enabled,
    publishAt: b.publishAt ? new Date(b.publishAt).toISOString() : null, unpublishAt: b.unpublishAt ? new Date(b.unpublishAt).toISOString() : null,
  }));
}

export function isLive(banner: Pick<HomepageBannerInput, 'enabled' | 'publishAt' | 'unpublishAt'>, now: Date): boolean {
  return banner.enabled && (!banner.publishAt || Date.parse(banner.publishAt) <= now.getTime()) && (!banner.unpublishAt || Date.parse(banner.unpublishAt) > now.getTime());
}

@Injectable()
export class HomepageBannersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Optional() @Inject(ConfigService) private readonly config?: ConfigService<EnvironmentVariables, true>,
  ) {}

  private get origin(): string { return this.config?.get('PUBLIC_MEDIA_ORIGIN', { infer: true }) ?? 'http://localhost:9000/products'; }

  private async images(ids: string[], client: Pick<PrismaService, 'productMedia'> = this.prisma): Promise<Map<string, HomepageBannerImage>> {
    const rows = ids.length ? await client.productMedia.findMany({ where: { id: { in: ids }, state: 'READY', kind: 'IMAGE' }, include: { renditions: true } }) : [];
    const map = new Map<string, HomepageBannerImage>();
    for (const row of rows) { const p = widestRenditionProjection(this.origin, row.renditions); if (p) map.set(row.id, p); }
    return map;
  }

  private async project(row: HomepageBannerConfig | null): Promise<HomepageBannersAdminConfig> {
    const stored = (row?.banners ?? []) as unknown as HomepageBannerInput[];
    const images = await this.images(stored.flatMap(b => b.mobileMediaId ? [b.desktopMediaId, b.mobileMediaId] : [b.desktopMediaId]));
    const banners: HomepageBannerAdmin[] = stored.map(b => ({ ...b, desktopImage: images.get(b.desktopMediaId) ?? null, mobileImage: b.mobileMediaId ? images.get(b.mobileMediaId) ?? null : null }));
    return { version: row?.version ?? 0, banners, updatedAt: row?.updatedAt.toISOString() ?? null };
  }

  async readAdmin(): Promise<HomepageBannersAdminConfig> {
    return this.project(await this.prisma.homepageBannerConfig.findUnique({ where: { id: CONFIG_ID } }));
  }

  /** Only enabled, in-window banners whose desktop image is READY are exposed. */
  async readPublic(now = new Date()): Promise<HomepageBannersPublicConfig> {
    const config = await this.readAdmin();
    return { banners: config.banners.flatMap(b => !isLive(b, now) || !b.desktopImage ? [] : [{
      id: b.id, title: b.title, subtitle: b.subtitle, ctaLabel: b.ctaLabel, href: b.href, imageAlt: b.imageAlt, desktopImage: b.desktopImage, mobileImage: b.mobileImage,
    }]) };
  }

  async mediaOptions(): Promise<HomepageBannerMediaOption[]> {
    const rows = await this.prisma.productMedia.findMany({
      where: { state: 'READY', kind: 'IMAGE' }, orderBy: { createdAt: 'desc' }, take: 60, include: { renditions: true, product: { select: { name: true } } },
    });
    return rows.flatMap(row => { const p = widestRenditionProjection(this.origin, row.renditions); return p ? [{ id: row.id, ...p, alt: row.altText ?? '', productName: row.product.name }] : []; });
  }

  async update(actorId: string, requestId: string, raw: HomepageBannersUpdate, idempotencyKey: string): Promise<HomepageBannersAdminConfig> {
    const banners = validateBanners(raw);
    const keyHash = digest(idempotencyKey);
    const payloadHash = digest(JSON.stringify({ expectedVersion: raw.expectedVersion, banners }));
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1752064113, 1935892596)`;
      const replay = await tx.homepageBannerCommand.findUnique({ where: { actorId_keyHash: { actorId, keyHash } } });
      if (replay) {
        if (replay.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This retry key belongs to different banner settings.' });
        return replay.response as unknown as HomepageBannersAdminConfig;
      }
      const current = await tx.homepageBannerConfig.findUnique({ where: { id: CONFIG_ID } });
      if ((current?.version ?? 0) !== raw.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'Banner settings changed; reload before saving.' });
      const ids = [...new Set(banners.flatMap(b => b.mobileMediaId ? [b.desktopMediaId, b.mobileMediaId] : [b.desktopMediaId]))];
      const images = await this.images(ids, tx);
      if (ids.some(id => !images.has(id))) throw new BadRequestException({ code: 'INVALID_MEDIA', message: 'Every banner image must be a ready, processed image.' });
      const before = await this.project(current);
      const data = banners as unknown as Prisma.InputJsonValue;
      const nextVersion = (current?.version ?? 0) + 1;
      const row = current
        ? await tx.homepageBannerConfig.update({ where: { id: CONFIG_ID }, data: { version: nextVersion, banners: data } })
        : await tx.homepageBannerConfig.create({ data: { id: CONFIG_ID, version: nextVersion, banners: data } });
      const result = await this.project(row);
      await this.audit.record({ actorId, requestId, action: 'storefront.homepage_banners.updated', entityType: 'homepage_banner_config', entityId: CONFIG_ID, before, after: result }, tx);
      await tx.homepageBannerCommand.create({ data: { actorId, keyHash, payloadHash, response: result as unknown as Prisma.InputJsonObject } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5000, maxWait: 2000 });
  }
}
