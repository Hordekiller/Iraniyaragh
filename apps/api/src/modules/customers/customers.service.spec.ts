import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CustomersService, canonicalMobile } from './customers.service';
import type { CustomerAddressesDto, CustomerCreateDto, CustomerListQueryDto, CustomerNoteDto, CustomerUpdateDto } from './customers.dto';

const KEY = 'customer-command-key-0001';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cus_1',
    mobile: '+989121112233',
    firstName: 'زهرا',
    lastName: 'کریمی',
    status: 'ACTIVE',
    version: 0,
    userId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    _count: { orders: 2 },
    ...overrides,
  };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord_1',
    number: 'ORD-1001',
    status: 'PAID',
    grandTotal: 1_250_000n,
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    payments: [{ status: 'PAID' }],
    fulfillment: { status: 'DELIVERED' },
    ...overrides,
  };
}

const customerDelegate = () => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
});

function harness() {
  const customer = customerDelegate();
  const customerAddress = { deleteMany: vi.fn(), createMany: vi.fn() };
  const customerNote = { create: vi.fn() };
  const customerCommandRecord = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
  const auditLog = { findMany: vi.fn(), count: vi.fn() };
  const user = { findUnique: vi.fn() };
  // $transaction is overloaded: reads pass an array of promises, commands pass
  // a callback. Both forms have to work for the harness to be honest.
  const $transaction = vi.fn(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)({
      $executeRaw: vi.fn(),
      user,
      customer,
      customerAddress,
      customerNote,
      customerCommandRecord,
    }),
  );
  const prisma = {
    customer,
    customerAddress,
    customerNote,
    customerCommandRecord,
    auditLog,
    user,
    $transaction,
  } as unknown as PrismaService;
  const audit = { record: vi.fn() } as unknown as AuditLogService;
  return {
    service: new CustomersService(prisma, audit),
    prisma: prisma as unknown as {
      customer: ReturnType<typeof customerDelegate>;
      customerAddress: typeof customerAddress;
      customerNote: typeof customerNote;
      customerCommandRecord: typeof customerCommandRecord;
      auditLog: typeof auditLog;
      user: typeof user;
      $transaction: ReturnType<typeof vi.fn>;
    },
    audit,
  };
}

/** Runs the command callback; the harness `$transaction` supplies the tx. */
function withTransaction<T>(h: ReturnType<typeof harness>, fn: () => Promise<T>) {
  return fn();
}

const context = { actorId: 'usr_1', requestId: 'req_1', idempotencyKey: KEY };

describe('verified customer self initialization', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
    h.prisma.user.findUnique.mockResolvedValue({ status: 'ACTIVE', mobile: '+989121112233', isMobileVerified: true });
    h.prisma.customer.findUnique.mockResolvedValue(null);
    h.prisma.customer.create.mockResolvedValue(makeRow({ firstName: null, lastName: null, userId: 'usr_1', addresses: [] }));
  });
  it('creates only the verified principal own empty profile and audits without PII', async () => {
    expect(await h.service.initializeOwn('usr_1', 'req_1')).toMatchObject({ firstName: null, lastName: null, addresses: [] });
    expect(h.prisma.customer.create).toHaveBeenCalledWith(expect.objectContaining({ data: { userId: 'usr_1', mobile: '+989121112233' } }));
    const event = vi.mocked(h.audit.record).mock.calls[0][0];
    expect(event).toMatchObject({ actorId: 'usr_1', action: 'customer.self_initialized', metadata: { hasUserAccount: true } });
    expect(JSON.stringify(event)).not.toContain('+989');
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'ReadCommitted' });
  });
  it('returns an existing linked account without resetting names, addresses, or version', async () => {
    h.prisma.customer.findUnique.mockResolvedValue(makeRow({ userId: 'usr_1', addresses: [], version: 7 }));
    expect(await h.service.initializeOwn('usr_1', 'req_1')).toMatchObject({ firstName: 'زهرا', lastName: 'کریمی', version: 7 });
    expect(h.prisma.customer.create).not.toHaveBeenCalled();
    expect(h.audit.record).not.toHaveBeenCalled();
  });
  it.each([null, { status: 'PENDING', mobile: '+989121112233', isMobileVerified: true },
    { status: 'ACTIVE', mobile: '+989121112233', isMobileVerified: false },
    { status: 'ACTIVE', mobile: null, isMobileVerified: true }])('denies ineligible principal %j', async user => {
    h.prisma.user.findUnique.mockResolvedValue(user);
    await expect(h.service.initializeOwn('usr_1', 'req_1')).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(h.prisma.customer.create).not.toHaveBeenCalled();
  });
  it('never reactivates an inactive linked account', async () => {
    h.prisma.customer.findUnique.mockResolvedValue(makeRow({ status: 'INACTIVE', addresses: [] }));
    await expect(h.service.initializeOwn('usr_1', 'req_1')).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(h.prisma.customer.create).not.toHaveBeenCalled();
  });
  it('never claims an existing commerce profile based on matching mobile', async () => {
    h.prisma.customer.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'foreign-profile' });
    await expect(h.service.initializeOwn('usr_1', 'req_1')).rejects.toMatchObject({ response: { code: 'CUSTOMER_ACCOUNT_LINK_REQUIRED' } });
    expect(h.prisma.customer.create).not.toHaveBeenCalled();
    expect(h.prisma.customer.updateMany).not.toHaveBeenCalled();
  });
  it('requires reconciliation if a concurrent staff profile wins the unique mobile', async () => {
    h.prisma.customer.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }));
    await expect(h.service.initializeOwn('usr_1', 'req_1')).rejects.toMatchObject({ response: { code: 'CUSTOMER_ACCOUNT_LINK_REQUIRED' } });
  });
  it('propagates persistence failure without false success', async () => {
    const failure = new Error('test database unavailable');
    h.prisma.customer.create.mockRejectedValue(failure);
    await expect(h.service.initializeOwn('usr_1', 'req_1')).rejects.toBe(failure);
  });
});

describe('canonicalMobile', () => {
  it.each([
    ['09121234567', '+989121234567'],
    ['+989121234567', '+989121234567'],
    ['989121234567', '+989121234567'],
    ['0912 123 4567', '+989121234567'],
    ['۰۹۱۲۱۲۳۴۵۶۷', '+989121234567'],
  ])('normalizes %s to E.164', (input, expected) => {
    expect(canonicalMobile(input)).toBe(expected);
  });

  it.each(['0812345678', '+14155552671', '0912123456', '', 'abc'])('rejects %s', (input) => {
    expect(() => canonicalMobile(input)).toThrow(BadRequestException);
  });
});

describe('customer self-service ownership', () => {
  it('loads only the record linked to the authenticated user and projects no staff data', async () => {
    const h = harness();
    h.prisma.customer.findUnique.mockResolvedValue({
      ...makeRow({ userId: 'user_owner', addresses: [], notes: [{ body: 'private staff note' }], orders: [] }),
      deactivatedAt: null,
    });

    const result = await h.service.getOwn('user_owner');

    expect(h.prisma.customer.findUnique).toHaveBeenCalledWith({ where: { userId: 'user_owner' }, select: expect.any(Object) });
    expect(result).toMatchObject({ id: 'cus_1', mobile: '+989121112233', version: 0, addresses: [] });
    expect(result).not.toHaveProperty('notes');
    expect(result).not.toHaveProperty('recentOrders');
  });

  it('ignores staff-only status changes on self-service address writes', async () => {
    const h = harness();
    h.prisma.customer.findUnique.mockResolvedValue({ id: 'cus_owner', status: 'ACTIVE' });
    const replace = vi.spyOn(h.service, 'replaceAddresses').mockResolvedValue({} as never);
    vi.spyOn(h.service, 'getOwn').mockResolvedValue({ id: 'cus_owner' } as never);

    await h.service.replaceOwnAddresses('user_owner', {
      expectedVersion: 2,
      addresses: [],
      status: 'INACTIVE',
    }, context);

    expect(replace).toHaveBeenCalledWith('cus_owner', { expectedVersion: 2, addresses: [] }, context);
  });
});

describe('CustomersService.list', () => {
  it('projects the summary and counts with stable id tiebreaker', async () => {
    const h = harness();
    h.prisma.customer.findMany.mockResolvedValue([makeRow()]);
    h.prisma.customer.count.mockResolvedValue(1);

    const query = { page: 1, perPage: 25 } as CustomerListQueryDto;
    const result = await h.service.list(query);

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 'cus_1',
      mobile: '+989121112233',
      status: 'ACTIVE',
      orderCount: 2,
      hasUserAccount: false,
    });
    const args = h.prisma.customer.findMany.mock.calls[0][0] as { orderBy: unknown[]; skip: number; take: number };
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args.skip).toBe(0);
    expect(args.take).toBe(25);
  });

  it('paginates from the page number', async () => {
    const h = harness();
    h.prisma.customer.findMany.mockResolvedValue([]);
    h.prisma.customer.count.mockResolvedValue(0);
    await h.service.list({ page: 3, perPage: 20 } as CustomerListQueryDto);
    expect((h.prisma.customer.findMany.mock.calls[0][0] as { skip: number }).skip).toBe(40);
  });

  it('sorts names and mobiles ascending by default but recency descending', async () => {
    const h = harness();
    h.prisma.customer.findMany.mockResolvedValue([]);
    h.prisma.customer.count.mockResolvedValue(0);

    await h.service.list({ page: 1, perPage: 25, sortBy: 'mobile' } as CustomerListQueryDto);
    expect((h.prisma.customer.findMany.mock.calls[0][0] as { orderBy: unknown[] }).orderBy).toEqual([
      { mobile: 'asc' }, { id: 'desc' },
    ]);

    await h.service.list({ page: 1, perPage: 25, sortBy: 'createdAt' } as CustomerListQueryDto);
    expect((h.prisma.customer.findMany.mock.calls[1][0] as { orderBy: unknown[] }).orderBy).toEqual([
      { createdAt: 'desc' }, { id: 'desc' },
    ]);
  });

  it('sorts by order count using the relation count', async () => {
    const h = harness();
    h.prisma.customer.findMany.mockResolvedValue([]);
    h.prisma.customer.count.mockResolvedValue(0);
    await h.service.list({ page: 1, perPage: 25, sortBy: 'orderCount' } as CustomerListQueryDto);
    expect((h.prisma.customer.findMany.mock.calls[0][0] as { orderBy: unknown[] }).orderBy).toEqual([
      { orders: { _count: 'desc' } }, { id: 'desc' },
    ]);
  });

  it('searches names case-insensitively and mobile tails', async () => {
    const h = harness();
    h.prisma.customer.findMany.mockResolvedValue([]);
    h.prisma.customer.count.mockResolvedValue(0);

    await h.service.list({ page: 1, perPage: 25, search: 'زهر' } as CustomerListQueryDto);
    const byName = (h.prisma.customer.findMany.mock.calls[0][0] as { where: Prisma.CustomerWhereInput }).where;
    expect(byName.OR).toEqual([
      { firstName: { contains: 'زهر', mode: 'insensitive' } },
      { lastName: { contains: 'زهر', mode: 'insensitive' } },
    ]);

    await h.service.list({ page: 1, perPage: 25, search: '+9891212' } as CustomerListQueryDto);
    const byMobile = (h.prisma.customer.findMany.mock.calls[1][0] as { where: Prisma.CustomerWhereInput }).where;
    expect(byMobile.OR).toEqual([
      { firstName: { contains: '+9891212', mode: 'insensitive' } },
      { lastName: { contains: '+9891212', mode: 'insensitive' } },
      { mobile: { contains: '9891212' } },
    ]);
  });

  it('filters by status and account linkage', async () => {
    const h = harness();
    h.prisma.customer.findMany.mockResolvedValue([]);
    h.prisma.customer.count.mockResolvedValue(0);

    await h.service.list({ page: 1, perPage: 25, status: 'INACTIVE' } as CustomerListQueryDto);
    expect((h.prisma.customer.findMany.mock.calls[0][0] as { where: Prisma.CustomerWhereInput }).where).toEqual({ status: 'INACTIVE' });

    await h.service.list({ page: 1, perPage: 25, hasUserAccount: true } as CustomerListQueryDto);
    expect((h.prisma.customer.findMany.mock.calls[1][0] as { where: Prisma.CustomerWhereInput }).where).toEqual({ userId: { not: null } });

    await h.service.list({ page: 1, perPage: 25, hasUserAccount: false } as CustomerListQueryDto);
    expect((h.prisma.customer.findMany.mock.calls[2][0] as { where: Prisma.CustomerWhereInput }).where).toEqual({ userId: null });
  });
});

describe('CustomersService.get', () => {
  it('returns addresses, notes and bounded order history', async () => {
    const h = harness();
    h.prisma.customer.findUnique.mockResolvedValue({
      ...makeRow({ status: 'INACTIVE', version: 4, deactivatedAt: new Date('2026-03-01T00:00:00.000Z') }),
      addresses: [
        { id: 'adr_1', label: 'خانه', receiverName: 'زهرا', mobile: '+989121112233', provinceCode: 'THR', city: 'تهران', addressLine: 'خیابان ولیعصر', postalCode: '1234567890', isDefault: true, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') },
      ],
      notes: [
        { id: 'not_1', visibility: 'INTERNAL', body: 'مشتری عمده', createdAt: new Date('2026-01-03T00:00:00.000Z'), createdBy: { id: 'usr_9', firstName: 'رضا', lastName: 'محمدی' } },
      ],
      orders: [makeOrder()],
    });

    const result = await h.service.get('cus_1');

    expect(result.status).toBe('INACTIVE');
    expect(result.deactivatedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(result.addresses).toHaveLength(1);
    expect(result.notes[0].author).toEqual({ id: 'usr_9', displayNameMasked: 'ر***' });
    expect(result.recentOrders[0]).toEqual({
      id: 'ord_1',
      number: 'ORD-1001',
      status: 'PAID',
      grandTotal: { amount: '1250000', currency: 'IRR' },
      paymentStatus: 'PAID',
      fulfillmentStatus: 'DELIVERED',
      placedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('never exposes order address or contact PII in the history projection', async () => {
    const h = harness();
    h.prisma.customer.findUnique.mockResolvedValue({
      ...makeRow(),
      deactivatedAt: null,
      addresses: [],
      notes: [],
      orders: [makeOrder()],
    });
    const result = await h.service.get('cus_1');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('addressSnapshot');
    expect(serialized).not.toContain('postalCode');
    expect(result.recentOrders[0]).not.toHaveProperty('address');
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    const h = harness();
    h.prisma.customer.findUnique.mockResolvedValue(null);
    await expect(h.service.get('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CustomersService.history', () => {
  it('returns audit entries for the customer entity only', async () => {
    const h = harness();
    h.prisma.customer.findUnique.mockResolvedValue({ id: 'cus_1' });
    h.prisma.auditLog.findMany.mockResolvedValue([
      { id: 'aud_1', action: 'customer.created', actorId: 'usr_1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    h.prisma.auditLog.count.mockResolvedValue(1);

    const result = await h.service.history('cus_1', { page: 1, perPage: 25 } as CustomerListQueryDto);
    expect(result.items[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect((h.prisma.auditLog.findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({
      entityType: 'Customer',
      entityId: 'cus_1',
    });
  });
});

describe('CustomersService.create', () => {
  it('stores the canonical mobile and masks it in the audit metadata', async () => {
    const h = harness();
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue(null);
    h.prisma.customerCommandRecord.create.mockResolvedValue({ id: 'ccr_1' });
    h.prisma.customer.create.mockResolvedValue(makeRow({ mobile: '+989121234567' }));

    const input: CustomerCreateDto = { mobile: '09121234567', firstName: 'زهرا', lastName: 'کریمی' };
    const result = await withTransaction(h, () => h.service.create(input, context));

    expect((h.prisma.customer.create.mock.calls[0][0] as { data: { mobile: string } }).data.mobile).toBe('+989121234567');
    expect(result.mobile).toBe('+989121234567');
    const auditArg = h.audit.record.mock.calls[0][0] as { action: string; metadata: { mobileMasked: string } };
    expect(auditArg.action).toBe('customer.created');
    expect(auditArg.metadata.mobileMasked).toBe('+9891*****567');
    expect(JSON.stringify(auditArg)).not.toContain('+989121234567');
  });

  it('maps a unique mobile violation to a conflict', async () => {
    const h = harness();
    const uniqueError = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6' });
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue(null);
    h.prisma.customerCommandRecord.create.mockResolvedValue({ id: 'ccr_1' });
    h.prisma.customer.create.mockRejectedValue(uniqueError);

    await expect(withTransaction(h, () => h.service.create({ mobile: '09121234567' } as CustomerCreateDto, context)))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('replays a prior identical command without re-creating', async () => {
    const h = harness();
    const stored = { id: 'cus_1', mobile: '+989121112233', firstName: null, lastName: null, status: 'ACTIVE', version: 0, orderCount: 0, hasUserAccount: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const input: CustomerCreateDto = { mobile: '09121112233' };

    // First call stores the record; capture the payload hash the service wrote.
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue(null);
    h.prisma.customerCommandRecord.create.mockResolvedValue({ id: 'ccr_1' });
    h.prisma.customer.create.mockResolvedValue(makeRow());
    await withTransaction(h, () => h.service.create(input, context));
    const storedHash = (h.prisma.customerCommandRecord.create.mock.calls[0][0] as { data: { payloadHash: string } }).data.payloadHash;
    h.prisma.customer.create.mockClear();

    h.prisma.customerCommandRecord.findUnique.mockResolvedValue({ payloadHash: storedHash, response: stored });
    const result = await withTransaction(h, () => h.service.create(input, context));

    expect(result).toEqual(stored);
    expect(h.prisma.customer.create).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key reused with a different payload', async () => {
    const h = harness();
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue({ payloadHash: 'deadbeef', response: {} });
    await expect(withTransaction(h, () => h.service.create({ mobile: '09121234567' } as CustomerCreateDto, context)))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a malformed idempotency key', async () => {
    const h = harness();
    await expect(h.service.create({ mobile: '09121234567' } as CustomerCreateDto, { ...context, idempotencyKey: 'short' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CustomersService.update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments the version and audits the changed fields', async () => {
    const h = harness();
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue(null);
    h.prisma.customerCommandRecord.create.mockResolvedValue({ id: 'ccr_1' });
    h.prisma.customer.findUnique.mockResolvedValue({ id: 'cus_1', version: 3, status: 'ACTIVE' });
    h.prisma.customer.findUniqueOrThrow.mockResolvedValue(makeRow({ version: 4 }));
    h.prisma.customer.updateMany.mockResolvedValue({ count: 1 });

    const input: CustomerUpdateDto = { expectedVersion: 3, firstName: 'زهرا' };
    const result = await withTransaction(h, () => h.service.update('cus_1', input, context));

    expect(result.version).toBe(4);
    const updateArg = h.prisma.customer.updateMany.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> };
    expect(updateArg.where).toEqual({ id: 'cus_1', version: 3 });
    expect(updateArg.data.version).toEqual({ increment: 1 });
    const auditArg = h.audit.record.mock.calls[0][0] as { action: string; metadata: Record<string, unknown> };
    expect(auditArg.action).toBe('customer.updated');
    expect(auditArg.metadata).toMatchObject({ changedFields: ['firstName'], fromVersion: 3, toVersion: 4 });
  });

  it('rejects a stale expected version', async () => {
    const h = harness();
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue(null);
    h.prisma.customerCommandRecord.create.mockResolvedValue({ id: 'ccr_1' });
    h.prisma.customer.findUnique.mockResolvedValue({ id: 'cus_1', version: 5, status: 'ACTIVE' });

    await expect(withTransaction(h, () => h.service.update('cus_1', { expectedVersion: 3, firstName: 'x' } as CustomerUpdateDto, context)))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a lost update race even when the guard passed', async () => {
    const h = harness();
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue(null);
    h.prisma.customerCommandRecord.create.mockResolvedValue({ id: 'ccr_1' });
    h.prisma.customer.findUnique.mockResolvedValue({ id: 'cus_1', version: 3, status: 'ACTIVE' });
    h.prisma.customer.updateMany.mockResolvedValue({ count: 0 });

    await expect(withTransaction(h, () => h.service.update('cus_1', { expectedVersion: 3, firstName: 'x' } as CustomerUpdateDto, context)))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an empty update', async () => {
    const h = harness();
    await expect(h.service.update('cus_1', { expectedVersion: 0 } as CustomerUpdateDto, context))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CustomersService.replaceAddresses', () => {
  const address = (over: Record<string, unknown> = {}) => ({
    label: 'خانه', receiverName: 'زهرا', mobile: '09121112233', provinceCode: 'THR',
    city: 'تهران', addressLine: 'خیابان ولیعصر', isDefault: true, ...over,
  });

  it('replaces the set and normalizes address mobiles', async () => {
    const h = harness();
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue(null);
    h.prisma.customerCommandRecord.create.mockResolvedValue({ id: 'ccr_1' });
    h.prisma.customer.findUnique.mockResolvedValue({ id: 'cus_1', version: 0, status: 'ACTIVE' });
    h.prisma.customer.findUniqueOrThrow.mockResolvedValue({ ...makeRow({ version: 1 }), deactivatedAt: null, addresses: [], notes: [], orders: [] });
    h.prisma.customer.updateMany.mockResolvedValue({ count: 1 });

    const input: CustomerAddressesDto = { expectedVersion: 0, addresses: [address()] };
    await withTransaction(h, () => h.service.replaceAddresses('cus_1', input, context));

    expect(h.prisma.customerAddress.deleteMany).toHaveBeenCalledWith({ where: { customerId: 'cus_1' } });
    const created = h.prisma.customerAddress.createMany.mock.calls[0][0] as { data: Array<{ mobile: string; customerId: string }> };
    expect(created.data[0].mobile).toBe('+989121112233');
    expect(created.data[0].customerId).toBe('cus_1');
    expect((h.audit.record.mock.calls[0][0] as { action: string }).action).toBe('customer.addresses_replaced');
  });

  it('deactivates and stamps deactivatedAt in the same command', async () => {
    const h = harness();
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue(null);
    h.prisma.customerCommandRecord.create.mockResolvedValue({ id: 'ccr_1' });
    h.prisma.customer.findUnique.mockResolvedValue({ id: 'cus_1', version: 2, status: 'ACTIVE' });
    h.prisma.customer.findUniqueOrThrow.mockResolvedValue({ ...makeRow({ version: 3, status: 'INACTIVE' }), deactivatedAt: new Date('2026-05-01T00:00:00.000Z'), addresses: [], notes: [], orders: [] });
    h.prisma.customer.updateMany.mockResolvedValue({ count: 1 });

    const input: CustomerAddressesDto = { expectedVersion: 2, addresses: [], status: 'INACTIVE' };
    const result = await withTransaction(h, () => h.service.replaceAddresses('cus_1', input, context));

    const data = (h.prisma.customer.updateMany.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe('INACTIVE');
    expect(data.deactivatedAt).toBeInstanceOf(Date);
    expect((h.audit.record.mock.calls[0][0] as { action: string }).action).toBe('customer.deactivated');
    expect(result.status).toBe('INACTIVE');
  });

  it('clears deactivatedAt when reactivating', async () => {
    const h = harness();
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue(null);
    h.prisma.customerCommandRecord.create.mockResolvedValue({ id: 'ccr_1' });
    h.prisma.customer.findUnique.mockResolvedValue({ id: 'cus_1', version: 3, status: 'INACTIVE' });
    h.prisma.customer.findUniqueOrThrow.mockResolvedValue({ ...makeRow({ version: 4, status: 'ACTIVE' }), deactivatedAt: null, addresses: [], notes: [], orders: [] });
    h.prisma.customer.updateMany.mockResolvedValue({ count: 1 });

    await withTransaction(h, () =>
      h.service.replaceAddresses('cus_1', { expectedVersion: 3, addresses: [], status: 'ACTIVE' } as CustomerAddressesDto, context),
    );
    const data = (h.prisma.customer.updateMany.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.deactivatedAt).toBeNull();
    expect((h.audit.record.mock.calls[0][0] as { action: string }).action).toBe('customer.reactivated');
  });

  it('requires exactly one default when addresses are supplied', async () => {
    const h = harness();
    await expect(h.service.replaceAddresses('cus_1', { expectedVersion: 0, addresses: [address({ isDefault: false })] } as CustomerAddressesDto, context))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects multiple defaults', async () => {
    const h = harness();
    await expect(
      h.service.replaceAddresses('cus_1', { expectedVersion: 0, addresses: [address(), address({ label: 'دفتر' })] } as CustomerAddressesDto, context),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows clearing every address', async () => {
    const h = harness();
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue(null);
    h.prisma.customerCommandRecord.create.mockResolvedValue({ id: 'ccr_1' });
    h.prisma.customer.findUnique.mockResolvedValue({ id: 'cus_1', version: 0, status: 'ACTIVE' });
    h.prisma.customer.findUniqueOrThrow.mockResolvedValue({ ...makeRow({ version: 1 }), deactivatedAt: null, addresses: [], notes: [], orders: [] });
    h.prisma.customer.updateMany.mockResolvedValue({ count: 1 });
    await withTransaction(h, () => h.service.replaceAddresses('cus_1', { expectedVersion: 0, addresses: [] } as CustomerAddressesDto, context));
    expect(h.prisma.customerAddress.createMany).not.toHaveBeenCalled();
  });
});

describe('CustomersService.addNote', () => {
  it('appends an internal note, bumps the version and audits it', async () => {
    const h = harness();
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue(null);
    h.prisma.customerCommandRecord.create.mockResolvedValue({ id: 'ccr_1' });
    h.prisma.customer.findUnique
      .mockResolvedValueOnce({ id: 'cus_1', version: 1, status: 'ACTIVE' })
      .mockResolvedValueOnce({
        ...makeRow({ version: 2 }), deactivatedAt: null, addresses: [],
        notes: [{ id: 'not_1', visibility: 'INTERNAL', body: 'مشتری عمده', createdAt: new Date('2026-01-05T00:00:00.000Z'), createdBy: { id: 'usr_1', firstName: 'رضا', lastName: null } }],
        orders: [],
      });
    h.prisma.customerNote.create.mockResolvedValue({ id: 'not_1' });
    h.prisma.customer.updateMany.mockResolvedValue({ count: 1 });

    const input: CustomerNoteDto = { expectedVersion: 1, visibility: 'INTERNAL', body: 'مشتری عمده' };
    const result = await withTransaction(h, () => h.service.addNote('cus_1', input, context));

    expect((h.prisma.customerNote.create.mock.calls[0][0] as { data: { createdById: string } }).data.createdById).toBe('usr_1');
    const auditArg = h.audit.record.mock.calls[0][0] as { action: string; metadata: Record<string, unknown> };
    expect(auditArg.action).toBe('customer.note_added');
    expect(auditArg.metadata).toMatchObject({ noteId: 'not_1', visibility: 'INTERNAL', fromVersion: 1, toVersion: 2 });
    expect(result.notes).toHaveLength(1);
  });

  it('keeps customer-visible notes distinguishable from internal ones', async () => {
    const h = harness();
    h.prisma.customerCommandRecord.findUnique.mockResolvedValue(null);
    h.prisma.customerCommandRecord.create.mockResolvedValue({ id: 'ccr_1' });
    h.prisma.customer.findUnique
      .mockResolvedValueOnce({ id: 'cus_1', version: 0, status: 'ACTIVE' })
      .mockResolvedValueOnce({
        ...makeRow({ version: 1 }), deactivatedAt: null, addresses: [],
        notes: [
          { id: 'not_1', visibility: 'INTERNAL', body: 'داخلی', createdAt: new Date('2026-01-05T00:00:00.000Z'), createdBy: { id: 'usr_1', firstName: null, lastName: null } },
          { id: 'not_2', visibility: 'CUSTOMER_VISIBLE', body: 'قابل نمایش', createdAt: new Date('2026-01-04T00:00:00.000Z'), createdBy: { id: 'usr_1', firstName: null, lastName: null } },
        ],
        orders: [],
      });
    h.prisma.customerNote.create.mockResolvedValue({ id: 'not_2' });
    h.prisma.customer.updateMany.mockResolvedValue({ count: 1 });

    const result = await withTransaction(h, () =>
      h.service.addNote('cus_1', { expectedVersion: 0, visibility: 'CUSTOMER_VISIBLE', body: 'قابل نمایش' } as CustomerNoteDto, context),
    );
    expect(result.notes.map((note) => note.visibility)).toEqual(['INTERNAL', 'CUSTOMER_VISIBLE']);
  });
});
