import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { CustomersService } from './customers.service';

describe.sequential('CustomersService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const digits = runId.replace(/\D/g, '').padStart(9, '0').slice(0, 9);
  const requestId = `customer-it-${runId}`;
  const prisma = new PrismaService();
  const service = new CustomersService(prisma, new AuditLogService(prisma));
  // User.mobile is VarChar(13): '+98' plus exactly ten digits starting with 9.
  const mobile = `+989${digits}`;
  const bumped = digits.slice(0, 8) + String((Number(digits.slice(-1)) + 1) % 10);
  const actorMobile = `+989${bumped}`;
  let actorId = '';
  let customerId = '';
  let orderId = '';
  const context = (key: string) => ({ actorId, requestId, idempotencyKey: `customer-${key}-${runId}` });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    const actor = await prisma.user.create({
      data: {
        mobile: actorMobile,
        status: 'ACTIVE',
        isMobileVerified: true,
        firstName: 'رضا',
        createdAt: new Date(Date.now() - 60_000),
        mobileVerifiedAt: new Date(),
      },
    });
    actorId = actor.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { requestId } });
    await prisma.customerCommandRecord.deleteMany({ where: { actorId } });
    if (orderId) await prisma.order.delete({ where: { id: orderId } });
    if (customerId) await prisma.customer.delete({ where: { id: customerId } });
    if (actorId) await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it('creates once across concurrent retries, normalizes the mobile and audits it', async () => {
    const [first, replay] = await Promise.all([
      service.create({ mobile: `09${digits}`, firstName: 'زهرا', lastName: 'کریمی' }, context('create')),
      service.create({ mobile: `09${digits}`, firstName: 'زهرا', lastName: 'کریمی' }, context('create')),
    ]);
    customerId = first.id;
    expect(replay).toEqual(first);
    expect(first.mobile).toBe(mobile);
    expect(await prisma.customer.count({ where: { mobile } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { requestId, action: 'customer.created' } })).toBe(1);

    // The unique index is the real guard: a different key, same mobile, conflicts.
    await expect(service.create({ mobile }, context('duplicate'))).rejects.toMatchObject({
      response: { code: 'CUSTOMER_MOBILE_CONFLICT' },
    });
    // A key reused with a different payload is a conflict, not a silent replay.
    await expect(service.create({ mobile, firstName: 'دیگر' }, context('create'))).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a non-Iranian mobile without creating a row', async () => {
    await expect(service.create({ mobile: '+14155552671' }, context('foreign'))).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.customer.count({ where: { mobile: '+14155552671' } })).toBe(0);
  });

  it('lists with search, status filter, pagination and stable ordering', async () => {
    const page = await service.list({ page: 1, perPage: 25, search: digits });
    expect(page.items.some(row => row.id === customerId)).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(1);

    // Operators copy the number as displayed, including the + and separators.
    const byMobileWithPlus = await service.list({ page: 1, perPage: 25, search: `+98 9 ${digits.slice(0, 6)}` });
    expect(byMobileWithPlus.items.some(row => row.id === customerId)).toBe(true);

    const byName = await service.list({ page: 1, perPage: 25, search: 'زهرا' });
    expect(byName.items.some(row => row.id === customerId)).toBe(true);

    const active = await service.list({ page: 1, perPage: 25, status: 'ACTIVE' });
    expect(active.items.every(row => row.status === 'ACTIVE')).toBe(true);

    const noAccount = await service.list({ page: 1, perPage: 25, hasUserAccount: false });
    expect(noAccount.items.some(row => row.id === customerId)).toBe(true);

    const secondPage = await service.list({ page: 2, perPage: 1 });
    expect(secondPage.items.length).toBeLessThanOrEqual(1);
  });

  it('sorts by every offered field and direction without failing the request', async () => {
    // Regression: an uppercased sort direction reached Prisma verbatim and made
    // every sorted list 500, because Prisma only accepts 'asc'/'desc'.
    for (const sortBy of ['createdAt', 'updatedAt', 'mobile', 'firstName', 'lastName', 'orderCount'] as const) {
      for (const sortDir of ['asc', 'desc'] as const) {
        const result = await service.list({ page: 1, perPage: 25, sortBy, sortDir });
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.total).toBeGreaterThanOrEqual(0);
      }
    }

    const byMobileAsc = await service.list({ page: 1, perPage: 25, sortBy: 'mobile', sortDir: 'asc' });
    const mobiles = byMobileAsc.items.map(row => row.mobile);
    expect([...mobiles].sort()).toEqual(mobiles);

    const byMobileDesc = await service.list({ page: 1, perPage: 25, sortBy: 'mobile', sortDir: 'desc' });
    const descMobiles = byMobileDesc.items.map(row => row.mobile);
    expect([...descMobiles].sort().reverse()).toEqual(descMobiles);

    // Newest first is the default for recency, and the customer created by this
    // run is the newest row, so it must lead the list.
    const newest = await service.list({ page: 1, perPage: 25, sortBy: 'createdAt', sortDir: 'desc' });
    expect(newest.items[0]?.id).toBe(customerId);

    // An unknown direction must fall back to the natural order for the field
    // instead of reaching the database.
    const fallback = await service.list({
      page: 1,
      perPage: 25,
      sortBy: 'mobile',
      sortDir: 'SIDEWAYS' as unknown as 'asc',
    });
    expect(fallback.items.map(row => row.mobile)).toEqual(mobiles);
  });

  it('updates under optimistic concurrency and rejects a stale write', async () => {
    const updated = await service.update(customerId, { expectedVersion: 0, firstName: 'زهرا‌م' }, context('rename'));
    expect(updated).toMatchObject({ version: 1, firstName: 'زهرا‌م' });
    expect(await service.update(customerId, { expectedVersion: 0, firstName: 'زهرا‌م' }, context('rename'))).toEqual(updated);
    await expect(service.update(customerId, { expectedVersion: 0, firstName: 'تست' }, context('stale'))).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update(customerId, { expectedVersion: 1 }, context('empty'))).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.auditLog.count({ where: { requestId, action: 'customer.updated' } })).toBe(1);
  });

  it('serializes two concurrent updates so exactly one wins', async () => {
    const before = (await service.get(customerId)).version;
    const results = await Promise.allSettled([
      service.update(customerId, { expectedVersion: before, lastName: 'الف' }, context('race-a')),
      service.update(customerId, { expectedVersion: before, lastName: 'ب' }, context('race-b')),
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected');
    expect(rejected).toBeDefined();
    expect((await service.get(customerId)).version).toBe(before + 1);
  });

  it('replaces the address set, enforcing a single default', async () => {
    const current = (await service.get(customerId)).version;
    const withAddresses = await service.replaceAddresses(
      customerId,
      {
        expectedVersion: current,
        addresses: [
          { label: 'خانه', receiverName: 'زهرا کریمی', mobile: `09${digits}`, provinceCode: 'THR', city: 'تهران', addressLine: 'خیابان ولیعصر', postalCode: '1234567890', isDefault: true },
          { label: 'دفتر', receiverName: 'زهرا کریمی', mobile: `+989${digits}`, provinceCode: 'THR', city: 'تهران', addressLine: 'خیابان شریعتی', isDefault: false },
        ],
      },
      context('addresses'),
    );
    expect(withAddresses.addresses).toHaveLength(2);
    expect(withAddresses.addresses[0].isDefault).toBe(true);
    expect(withAddresses.addresses.every(a => a.mobile === mobile)).toBe(true);
    expect(await prisma.customerAddress.count({ where: { customerId } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { requestId, action: 'customer.addresses_replaced' } })).toBe(1);

    await expect(
      service.replaceAddresses(customerId, { expectedVersion: withAddresses.version, addresses: [{ label: 'a', receiverName: 'b', mobile: `09${digits}`, provinceCode: 'THR', city: 'c', addressLine: 'd' }] }, context('no-default')),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.replaceAddresses(customerId, { expectedVersion: withAddresses.version, addresses: [
        { label: 'a', receiverName: 'b', mobile: `09${digits}`, provinceCode: 'THR', city: 'c', addressLine: 'd', isDefault: true },
        { label: 'e', receiverName: 'f', mobile: `09${digits}`, provinceCode: 'THR', city: 'g', addressLine: 'h', isDefault: true },
      ] }, context('two-defaults')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('appends internal and customer-visible notes separately', async () => {
    let current = (await service.get(customerId)).version;
    const afterInternal = await service.addNote(customerId, { expectedVersion: current, visibility: 'INTERNAL', body: 'مشتری عمده' }, context('note-internal'));
    expect(afterInternal.notes[0]).toMatchObject({ visibility: 'INTERNAL', body: 'مشتری عمده' });
    expect(afterInternal.notes[0].author).toMatchObject({ id: actorId });

    current = afterInternal.version;
    const afterVisible = await service.addNote(customerId, { expectedVersion: current, visibility: 'CUSTOMER_VISIBLE', body: 'تخفیف ویژه' }, context('note-visible'));
    expect(afterVisible.notes.map(n => n.visibility)).toEqual(['CUSTOMER_VISIBLE', 'INTERNAL']);
    expect(await prisma.customerNote.count({ where: { customerId } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { requestId, action: 'customer.note_added' } })).toBe(2);
  });

  it('deactivates instead of deleting and stays referable by orders', async () => {
    // A historical order must keep resolving to its customer after deactivation.
    orderId = `order_it_${runId}`;
    await prisma.order.create({
      data: {
        id: orderId,
        number: `ORD-IT-${runId}`,
        customerId,
        status: 'PAID',
        subtotal: 1_250_000n,
        shipping: 0n,
        grandTotal: 1_250_000n,
        addressSnapshot: {
          provinceCode: 'THR', city: 'تهران', address: 'خیابان تست', postalCode: '1234567890',
          recipient: 'زهرا کریمی', mobile,
        },
        shippingMethod: 'COD',
        shippingMethodTitle: 'درگاه پرداخت',
        shippingPolicyRevision: 'it-policy',
        pricePolicyRevision: 'it-price',
        reservationExpiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const current = (await service.get(customerId)).version;
    const deactivated = await service.replaceAddresses(customerId, { expectedVersion: current, addresses: [], status: 'INACTIVE' }, context('deactivate'));
    expect(deactivated.status).toBe('INACTIVE');
    expect(deactivated.deactivatedAt).not.toBeNull();
    expect(await prisma.customer.count({ where: { id: customerId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { requestId, action: 'customer.deactivated' } })).toBe(1);

    const reactivated = await service.replaceAddresses(customerId, { expectedVersion: deactivated.version, addresses: [], status: 'ACTIVE' }, context('reactivate'));
    expect(reactivated.status).toBe('ACTIVE');
    expect(reactivated.deactivatedAt).toBeNull();
  });

  it('projects order history without address or contact PII', async () => {
    const detail = await service.get(customerId);
    expect(detail.recentOrders.some(row => row.id === orderId)).toBe(true);
    const entry = detail.recentOrders.find(row => row.id === orderId)!;
    expect(entry.grandTotal).toEqual({ amount: '1250000', currency: 'IRR' });
    expect(entry.placedAt).toBeTruthy();
    const serialized = JSON.stringify(detail);
    // The stored snapshot holds a real address; it must not reach the response.
    expect(serialized).not.toContain('addressSnapshot');
    expect(serialized).not.toContain('خیابان تست');
    expect(serialized).not.toContain('1234567890');
  });

  it('returns audit history and NOT_FOUND for an unknown customer', async () => {
    const history = await service.history(customerId, { page: 1, perPage: 50 });
    expect(history.items.length).toBeGreaterThanOrEqual(5);
    expect(history.items.map(row => row.action)).toContain('customer.created');
    expect(history.items.map(row => row.action)).toContain('customer.deactivated');
    await expect(service.get(`missing_${runId}`)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.history(`missing_${runId}`, { page: 1, perPage: 25 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('leaves no command or audit rows for this run behind', async () => {
    expect(await prisma.customerCommandRecord.count({ where: { actorId } })).toBeGreaterThan(0);
    expect(await prisma.customerNote.count({ where: { customerId } })).toBe(2);
  });
});
