import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { ShopController, ShopUpdateDto } from './shop.controller';
import { WishlistController, WishlistMergeDto } from './wishlist.controller';
import { StorefrontAssetsController, StorefrontAssetUploadDto } from '../media/storefront-assets.controller';
function context(target: object, handler: unknown) {
  return { getClass: () => target, getHandler: () => handler, switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer test' }, method: 'PUT', originalUrl: '/test' }) }) };
}
describe('dedicated shop access and payload boundaries', () => {
  it('checks current permissions and fresh MFA for shop writes', async () => {
    const principal = { userId: 'operator', authenticationLevel: 'STAFF_MFA', permissions: new Set<string>(), authenticatedAt: new Date() };
    const guard = new AuthGuard({ resolveBearerToken: vi.fn(async () => principal) } as never, { record: vi.fn() } as never);
    await expect(guard.canActivate(context(ShopController, ShopController.prototype.update) as never)).rejects.toMatchObject({ status: 403 });
    principal.permissions.add('settings.manage');
    principal.authenticatedAt = new Date(0);
    await expect(guard.canActivate(context(ShopController, ShopController.prototype.update) as never)).rejects.toMatchObject({ status: 401 });
  });
  it('does not let staff authentication impersonate a customer wishlist', async () => {
    const guard = new AuthGuard({ resolveBearerToken: vi.fn(async () => ({ userId: 'operator', authenticationLevel: 'STAFF_MFA', permissions: new Set(['settings.manage']) })) } as never, { record: vi.fn() } as never);
    await expect(guard.canActivate(context(WishlistController, WishlistController.prototype.merge) as never)).rejects.toMatchObject({ status: 403 });
  });
  it('protects independent uploads with media write permission', async () => {
    const guard = new AuthGuard({ resolveBearerToken: vi.fn(async () => ({ userId: 'operator', authenticationLevel: 'STAFF_MFA', permissions: new Set(['settings.manage']) })) } as never, { record: vi.fn() } as never);
    await expect(guard.canActivate(context(StorefrontAssetsController, StorefrontAssetsController.prototype.upload) as never)).rejects.toMatchObject({ status: 403 });
  });
  it('rejects unbounded selections, duplicate wishlist input and unsupported upload types', async () => {
    expect(await validate(plainToInstance(WishlistMergeDto, { slugs: ['same', 'same'] }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(StorefrontAssetUploadDto, { originalFilename: 'x.svg', declaredMime: 'image/svg+xml', bytes: 40, altText: 'x' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(ShopUpdateDto, { expectedVersion: 0, hero: [], banners: [], categoryIds: [], brandIds: [], sections: Array.from({ length: 13 }, () => ({ id: 'a', kind: 'newest', title: 'x', description: '', enabled: true, limit: 8, categoryId: null, productIds: [] })) }))).not.toHaveLength(0);
  });
});
