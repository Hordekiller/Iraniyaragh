import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ContactChannel, StorefrontContactLink, StorefrontContactsAdmin, StorefrontContactsUpdate } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

const CHANNELS: readonly ContactChannel[] = ['instagram', 'whatsapp', 'bale', 'phone', 'other'];
const CONTACT_ID = 'storefront';

export function validateContactsUpdate(raw: unknown): StorefrontContactsUpdate {
  const input = raw as StorefrontContactsUpdate;
  if (!input || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || !Array.isArray(input.links) || input.links.length > 12) {
    throw new BadRequestException({ code: 'INVALID_CONTACTS', message: 'Invalid contact settings.' });
  }
  const seen = new Set<string>();
  const links = input.links.map((item): StorefrontContactLink => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(item.id) || seen.has(item.id)
      || !CHANNELS.includes(item.channel) || typeof item.label !== 'string' || item.label.trim().length < 2 || item.label.trim().length > 40
      || typeof item.value !== 'string' || item.value.length > 500) {
      throw new BadRequestException({ code: 'INVALID_CONTACTS', message: 'Invalid contact link.' });
    }
    seen.add(item.id);
    const value = item.value.trim();
    if (item.channel === 'phone') {
      const digits = value.replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)).replace(/[\s()-]/g, '');
      if (!/^\+?[0-9]{7,15}$/.test(digits)) throw new BadRequestException({ code: 'INVALID_CONTACTS', message: 'Invalid phone number.' });
      return { id: item.id, channel: item.channel, label: item.label.trim(), value: digits };
    }
    let url: URL;
    try { url = new URL(value); } catch { throw new BadRequestException({ code: 'INVALID_CONTACTS', message: 'Invalid contact URL.' }); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port) {
      throw new BadRequestException({ code: 'INVALID_CONTACTS', message: 'Contact links must use HTTPS.' });
    }
    return { id: item.id, channel: item.channel, label: item.label.trim(), value: url.href };
  });
  return { expectedVersion: input.expectedVersion, links };
}

@Injectable()
export class StorefrontContactsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AuditLogService) private readonly audit: AuditLogService) {}

  private project(row: { links: Prisma.JsonValue; version: number; updatedAt: Date } | null): StorefrontContactsAdmin {
    return { links: row ? row.links as StorefrontContactLink[] : [], version: row?.version ?? 0, updatedAt: row?.updatedAt.toISOString() ?? null };
  }

  async readAdmin(): Promise<StorefrontContactsAdmin> {
    return this.project(await this.prisma.storefrontContactConfig.findUnique({ where: { id: CONTACT_ID } }));
  }

  async readPublic() { return { links: (await this.readAdmin()).links }; }

  async update(actorId: string, requestId: string, raw: unknown): Promise<StorefrontContactsAdmin> {
    const input = validateContactsUpdate(raw);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1752064113, 1935892598)`;
      const current = await tx.storefrontContactConfig.findUnique({ where: { id: CONTACT_ID } });
      if ((current?.version ?? 0) !== input.expectedVersion) {
        throw new ConflictException({ code: 'STALE_VERSION', message: 'Contact settings changed; reload before saving.' });
      }
      const before = this.project(current);
      const row = await tx.storefrontContactConfig.upsert({ where: { id: CONTACT_ID },
        create: { id: CONTACT_ID, version: 1, links: input.links },
        update: { version: input.expectedVersion + 1, links: input.links } });
      const after = this.project(row);
      await this.audit.record({ actorId, requestId, action: 'storefront.contacts.updated', entityType: 'storefront_contact_config', entityId: CONTACT_ID, before, after }, tx);
      return after;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5000, maxWait: 2000 });
  }
}
