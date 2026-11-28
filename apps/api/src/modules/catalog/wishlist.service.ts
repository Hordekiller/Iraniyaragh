import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { CatalogIdempotencyService } from './catalog-idempotency.service';
@Injectable()
export class WishlistService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CatalogIdempotencyService) private readonly idempotency: CatalogIdempotencyService) {}
  async list(userId: string, tx: Prisma.TransactionClient = this.prisma) {
    const rows = await tx.wishlistItem.findMany({ where: { userId, product: { status: 'ACTIVE' } }, take: 40, orderBy: [{ createdAt: 'desc' }, { productId: 'asc' }], select: { product: { select: { id: true, slug: true } } } });
    return rows.map(row => row.product);
  }
  async change(userId: string, key: string, input: { slugs: string[] } | { slug: string; enabled: boolean }) {
    return this.idempotency.run({ actorId: userId, scope: 'wishlist.change', key, payload: input, execute: async tx => {
      const [hi, lo] = advisoryLockIdKey('wishlist', userId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
      await tx.wishlistItem.deleteMany({ where: { userId, product: { status: { not: 'ACTIVE' } } } });
      const merge = 'slugs' in input;
      const products = await tx.product.findMany({ where: { slug: { in: merge ? input.slugs : [input.slug] }, ...(merge || input.enabled ? { status: 'ACTIVE' as const } : {}) }, select: { id: true, slug: true }, take: 40 });
      if (!merge && input.enabled && !products.length) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product is unavailable.' });
      if (!merge && !input.enabled) await tx.wishlistItem.deleteMany({ where: { userId, productId: { in: products.map(p => p.id) } } });
      else {
        const existing = await this.list(userId, tx);
        const additions = products.filter(p => !existing.some(e => e.id === p.id));
        if (!merge && existing.length + additions.length > 40) throw new ConflictException({ code: 'WISHLIST_LIMIT', message: 'Remove an item before adding another.' });
        const data = additions.slice(0, 40 - existing.length).map(p => ({ userId, productId: p.id }));
        if (data.length) await tx.wishlistItem.createMany({ data, skipDuplicates: true });
      }
      return { response: await this.list(userId, tx) };
    } });
  }
}
