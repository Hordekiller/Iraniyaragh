import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceDocument } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import {
  customerInvoice,
  invoicePage,
  InvoicePublicationService,
} from './invoice-publication.service';
const money = (amount: string) => ({ amount, currency: 'IRR' as const });
const snapshot = {
  id: 'doc-a',
  number: 'IRY-2026-000001',
  orderId: 'order-a',
  issuedAt: '2026-10-13T12:00:00Z',
  customerId: 'internal-owner',
  draftId: 'internal-draft',
  draftVersion: 3,
  policyVersion: 4,
  note: 'staff-only note',
  seller: {
    name: 'Seller',
    address: 'Public address',
    contact: 'Public contact',
  },
  buyerLabel: 'Buyer',
  address: {
    provinceCode: 'THR',
    city: 'City',
    address: 'Buyer address',
    postalCode: '1234567890',
    recipient: 'Recipient',
    mobile: 'test-destination',
  },
  taxPolicy: {
    treatment: 'INCLUSIVE',
    rateBps: 0,
    exemptionReason: null,
    shippingTaxable: false,
  },
  shipping: { title: 'Pickup', policyRevision: 'private-policy' },
  quote: {
    subtotal: money('9007199254740993'),
    discount: money('0'),
    shipping: money('0'),
    netAmount: money('9007199254740993'),
    tax: money('0'),
    total: money('9007199254740993'),
    lines: [{ id: 'private-line' }],
  },
  lines: [
    {
      orderItemId: 'private-item',
      variantId: 'internal-variant',
      sku: 'SKU',
      title: 'Item',
      quantity: 1,
      unitPrice: money('9007199254740993'),
      discount: money('0'),
      netAmount: money('9007199254740993'),
      tax: money('0'),
      total: money('9007199254740993'),
    },
  ],
} as InvoiceDocument;
const now = new Date('2026-10-13T12:00:00Z');
function setup() {
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: 'doc-a' }]),
    invoiceDocument: {
      findUnique: vi.fn(async () => ({
        id: 'doc-a',
        customer: { status: 'ACTIVE' },
      })),
      findUniqueOrThrow: vi.fn(async () => ({
        customer: { status: 'ACTIVE' },
      })),
      findFirst: vi.fn(async () => ({ snapshot })),
      findMany: vi.fn(async () => [
        {
          id: 'doc-a',
          number: snapshot.number,
          orderId: 'order-a',
          issuedAt: now,
          grandTotal: 9007199254740993n,
        },
      ]),
      count: vi.fn(async () => 1),
    },
    invoicePublication: {
      findUnique: vi.fn(
        async () =>
          null as null | {
            documentId: string;
            version: number;
            isPublished: boolean;
            updatedAt: Date;
          },
      ),
      upsert: vi.fn(async () => ({
        documentId: 'doc-a',
        version: 1,
        isPublished: true,
        updatedAt: now,
      })),
    },
    invoicePublicationEvent: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'event-a',
        ...data,
      })),
    },
    invoicePublicationCommand: {
      findUnique: vi.fn(async () => null as unknown),
      create: vi.fn(async () => ({ id: 'command-a' })),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(
      async (operation: (value: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
  };
  const audit = { record: vi.fn(async () => undefined) };
  return {
    tx,
    prisma,
    audit,
    service: new InvoicePublicationService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditLogService,
    ),
  };
}
describe('Invoice publication privacy and fail-closed command behavior', () => {
  let current: ReturnType<typeof setup>;
  beforeEach(() => {
    current = setup();
  });
  const input = {
    expectedVersion: 0,
    isPublished: true,
    reason: 'Private operator reason',
  };
  it('allowlists customer document content and preserves exact large IRR without staff identifiers', () => {
    const result = customerInvoice(snapshot);
    expect(result.quote.total.amount).toBe('9007199254740993');
    expect(Object.keys(result)).toEqual([
      'id',
      'number',
      'orderId',
      'issuedAt',
      'seller',
      'buyerLabel',
      'address',
      'taxPolicy',
      'shippingTitle',
      'quote',
      'lines',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/private-|internal-|staff-only/);
    const extended = structuredClone(snapshot);
    Object.assign(extended.quote.total, { secret: 'hidden' });
    expect(customerInvoice(extended).quote.total).not.toHaveProperty('secret');
  });
  it('private absent publication starts at version zero with bounded history', async () => {
    expect(await current.service.read('doc-a')).toMatchObject({
      publication: { version: 0, isPublished: false, updatedAt: null },
      history: [],
      count: 0,
    });
    expect(current.tx.invoicePublicationEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25, skip: 0 }),
    );
  });
  it('missing staff or owned customer document remains not-found', async () => {
    current.tx.invoiceDocument.findUnique.mockResolvedValueOnce(null as never);
    await expect(current.service.read('missing')).rejects.toMatchObject({
      response: { code: 'INVOICE_DOCUMENT_NOT_FOUND' },
    });
    current.tx.invoiceDocument.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      current.service.customerRead('customer-a', 'doc-a'),
    ).rejects.toMatchObject({
      response: { code: 'INVOICE_DOCUMENT_NOT_FOUND' },
    });
  });
  it('customer detail and list queries bind active owner and current visibility to the principal', async () => {
    await current.service.customerRead('customer-a', 'doc-a');
    await current.service.customerList('customer-a', 25, 25);
    const ownership = {
      customer: { userId: 'customer-a', status: 'ACTIVE' },
      publication: { isPublished: true },
    };
    expect(current.tx.invoiceDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-a', ...ownership },
      select: { snapshot: true },
    });
    expect(current.tx.invoiceDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: ownership, take: 25, skip: 25 }),
    );
    expect(current.tx.invoiceDocument.count).toHaveBeenCalledWith({
      where: ownership,
    });
  });
  it('missing principal cannot become an unfiltered Prisma ownership query', async () => {
    for (const identity of ['', undefined, null]) {
      await expect(
        current.service.customerRead(identity as string, 'doc-a'),
      ).rejects.toMatchObject({
        response: { code: 'INVOICE_DOCUMENT_NOT_FOUND' },
      });
      await expect(
        current.service.customerList(identity as string),
      ).rejects.toMatchObject({
        response: { code: 'INVOICE_DOCUMENT_NOT_FOUND' },
      });
    }
    expect(current.prisma.$transaction).not.toHaveBeenCalled();
    expect(current.tx.invoiceDocument.findFirst).not.toHaveBeenCalled();
  });
  it('records one explicit publication with safe audit metadata and no financial writer', async () => {
    expect(
      await current.service.change(
        'operator',
        'request-a',
        'doc-a',
        input,
        'test-key',
      ),
    ).toMatchObject({
      publication: { version: 1, isPublished: true },
      replayed: false,
    });
    expect(current.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invoice.access.published',
        metadata: { publicationVersion: 1, isPublished: true },
      }),
      current.tx,
    );
    expect(JSON.stringify(current.audit.record.mock.calls)).not.toContain(
      input.reason,
    );
    expect(current.tx.invoicePublicationCommand.create).toHaveBeenCalledTimes(
      1,
    );
  });
  it('authoritative revocation is independent of original invoice financial state', async () => {
    current.tx.invoicePublication.findUnique.mockResolvedValueOnce({
      documentId: 'doc-a',
      version: 1,
      isPublished: true,
      updatedAt: now,
    });
    current.tx.invoicePublication.upsert.mockResolvedValueOnce({
      documentId: 'doc-a',
      version: 2,
      isPublished: false,
      updatedAt: now,
    });
    expect(
      await current.service.change(
        'operator',
        'request-a',
        'doc-a',
        { ...input, expectedVersion: 1, isPublished: false },
        'test-key',
      ),
    ).toMatchObject({ publication: { version: 2, isPublished: false } });
    expect(current.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'invoice.access.revoked' }),
      current.tx,
    );
  });
  it('stale version, no-op and inactive customer refuse access without a write', async () => {
    await expect(
      current.service.change(
        'operator',
        'request-a',
        'doc-a',
        { ...input, expectedVersion: 1 },
        'test-key',
      ),
    ).rejects.toMatchObject({
      response: { code: 'INVOICE_PUBLICATION_CONFLICT' },
    });
    await expect(
      current.service.change(
        'operator',
        'request-a',
        'doc-a',
        { ...input, isPublished: false },
        'test-key',
      ),
    ).rejects.toMatchObject({
      response: { code: 'INVOICE_PUBLICATION_CONFLICT' },
    });
    current.tx.invoiceDocument.findUniqueOrThrow.mockResolvedValueOnce({
      customer: { status: 'INACTIVE' },
    });
    await expect(
      current.service.change(
        'operator',
        'request-a',
        'doc-a',
        input,
        'test-key',
      ),
    ).rejects.toMatchObject({
      response: { code: 'INVOICE_PUBLICATION_CONFLICT' },
    });
    expect(current.tx.invoicePublication.upsert).not.toHaveBeenCalled();
  });
  it('missing issued document cannot acquire publication state', async () => {
    current.tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(
      current.service.change(
        'operator',
        'request-a',
        'missing',
        input,
        'test-key',
      ),
    ).rejects.toMatchObject({
      response: { code: 'INVOICE_DOCUMENT_NOT_FOUND' },
    });
    expect(current.tx.invoicePublication.upsert).not.toHaveBeenCalled();
  });
  it('provider/database diagnostics never become a success or public exception message', async () => {
    current.tx.invoiceDocument.findFirst.mockRejectedValueOnce(
      new Error('private destination credential'),
    );
    await expect(
      current.service.customerRead('customer-a', 'doc-a'),
    ).rejects.toMatchObject({
      response: {
        code: 'INVOICE_PUBLICATION_UNAVAILABLE',
        message: expect.not.stringContaining('private destination'),
      },
    });
  });
  it.each([
    { reason: '' },
    { reason: '\nsecret' },
    { reason: 'x'.repeat(501) },
    { isPublished: 'true' },
    { expectedVersion: -1 },
  ])(
    'rejects invalid visibility decisions before database work',
    async (patch) => {
      await expect(
        current.service.change(
          'operator',
          'request-a',
          'doc-a',
          { ...input, ...patch } as typeof input,
          'test-key',
        ),
      ).rejects.toBeDefined();
      expect(current.prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each([
    { customerId: 'foreign' },
    { offset: '-1' },
    { offset: ['0'] },
    { limit: '101' },
    { limit: '0' },
    { offset: '1000001' },
  ])('rejects owner injection and unbounded pagination', (query) => {
    expect(() => invoicePage(query)).toThrow();
  });
  it('accepts bounded defaults and rejects invalid direct service pagination', async () => {
    expect(invoicePage({})).toEqual({ offset: 0, limit: 25 });
    expect(invoicePage({ offset: '25', limit: '100' })).toEqual({
      offset: 25,
      limit: 100,
    });
    await expect(
      current.service.customerList('customer-a', 0, 101),
    ).rejects.toBeDefined();
    await expect(current.service.read('doc-a', -1, 25)).rejects.toBeDefined();
  });
});
