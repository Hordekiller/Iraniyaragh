import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  CustomerInvoice,
  InvoiceDocument,
  InvoicePublication,
  InvoicePublicationRequest,
} from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import {
  isPrismaTransactionConflict,
  withSerializableRetry,
} from '../../common/serializable-retry';
import { RedactedLogger } from '../../common/redacted-logger';
import {
  invoiceDraftId,
  invoiceDraftVersion,
} from './invoice-draft.validation';
import { invoiceInvalid } from './invoice-policy.validation';
const missing = () =>
  new NotFoundException({
    code: 'INVOICE_DOCUMENT_NOT_FOUND',
    message: 'Invoice document does not exist.',
  });
const conflict = () =>
  new ConflictException({
    code: 'INVOICE_PUBLICATION_CONFLICT',
    message: 'Review current invoice visibility before changing access.',
  });
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function publication(row: {
  documentId: string;
  version: number;
  isPublished: boolean;
  updatedAt: Date;
}): InvoicePublication {
  return {
    documentId: row.documentId,
    version: row.version,
    isPublished: row.isPublished,
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function customerInvoice(snapshot: InvoiceDocument): CustomerInvoice {
  const { subtotal, discount, shipping, netAmount, tax, total } =
    snapshot.quote;
  const money = (value: typeof total) => ({
    amount: value.amount,
    currency: value.currency,
  });
  // Explicit allowlist: never forward a staff document or arbitrary snapshot
  // properties to a customer, including notes and internal evidence identifiers.
  return {
    id: snapshot.id,
    number: snapshot.number,
    orderId: snapshot.orderId,
    issuedAt: snapshot.issuedAt,
    seller: {
      name: snapshot.seller.name,
      address: snapshot.seller.address,
      contact: snapshot.seller.contact,
    },
    buyerLabel: snapshot.buyerLabel,
    address: {
      provinceCode: snapshot.address.provinceCode,
      city: snapshot.address.city,
      address: snapshot.address.address,
      postalCode: snapshot.address.postalCode,
      recipient: snapshot.address.recipient,
      mobile: snapshot.address.mobile,
    },
    taxPolicy: {
      treatment: snapshot.taxPolicy.treatment,
      rateBps: snapshot.taxPolicy.rateBps,
      exemptionReason: snapshot.taxPolicy.exemptionReason,
      shippingTaxable: snapshot.taxPolicy.shippingTaxable,
    },
    shippingTitle: snapshot.shipping.title,
    quote: {
      subtotal: money(subtotal),
      discount: money(discount),
      shipping: money(shipping),
      netAmount: money(netAmount),
      tax: money(tax),
      total: money(total),
    },
    lines: snapshot.lines.map((line) => ({
      sku: line.sku,
      title: line.title,
      quantity: line.quantity,
      unitPrice: money(line.unitPrice),
      discount: money(line.discount),
      netAmount: money(line.netAmount),
      tax: money(line.tax),
      total: money(line.total),
    })),
  };
}
export function invoicePage(query: Record<string, unknown>) {
  if (Object.keys(query).some((key) => !['offset', 'limit'].includes(key)))
    throw invoiceInvalid('Only bounded pagination is accepted.');
  const parse = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,6})$/u.test(value))
      throw invoiceInvalid('Bounded pagination is required.');
    return Number(value);
  };
  const offset = parse(query.offset, 0),
    limit = parse(query.limit, 25);
  if (offset > 1000000 || limit < 1 || limit > 100)
    throw invoiceInvalid('Bounded pagination is required.');
  return { offset, limit };
}
function bounded(offset: number, limit: number) {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 1000000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw invoiceInvalid('Bounded pagination is required.');
}
@Injectable()
export class InvoicePublicationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}
  async read(id: string, offset = 0, limit = 25) {
    invoiceDraftId(id);
    bounded(offset, limit);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (
            !(await tx.invoiceDocument.findUnique({
              where: { id },
              select: { id: true },
            }))
          )
            throw missing();
          const head = await tx.invoicePublication.findUnique({
            where: { documentId: id },
          });
          const history = await tx.invoicePublicationEvent.findMany({
            where: { documentId: id },
            orderBy: { version: 'desc' },
            skip: offset,
            take: limit,
          });
          return {
            publication: head
              ? publication(head)
              : {
                  documentId: id,
                  version: 0,
                  isPublished: false,
                  updatedAt: null,
                },
            history: history.map((row) => ({
              documentId: id,
              version: row.version,
              isPublished: row.isPublished,
              updatedAt: row.createdAt.toISOString(),
              createdAt: row.createdAt.toISOString(),
              actorId: row.actorId,
              reason: row.reason,
            })),
            count: await tx.invoicePublicationEvent.count({
              where: { documentId: id },
            }),
            offset,
            limit,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    } catch (error) {
      return this.safeFailure(error);
    }
  }
  async change(
    actorId: string,
    requestId: string,
    id: string,
    raw: InvoicePublicationRequest,
    key: string,
  ) {
    invoiceDraftId(id);
    const expectedVersion = invoiceDraftVersion(raw.expectedVersion);
    if (
      typeof raw.isPublished !== 'boolean' ||
      typeof raw.reason !== 'string' ||
      !raw.reason.trim() ||
      raw.reason.length > 500 ||
      [...raw.reason].some((character) => {
        const point = character.codePointAt(0)!;
        return point < 32 || point === 127;
      })
    )
      throw invoiceInvalid(
        'An explicit visibility decision and bounded private reason are required.',
      );
    if (!actorId || !requestId?.trim() || requestId.length > 100)
      throw invoiceInvalid('A tracked actor/request is required.');
    const input = {
      expectedVersion,
      isPublished: raw.isPublished,
      reason: raw.reason.trim().normalize('NFC'),
    };
    if (input.reason.length > 500)
      throw invoiceInvalid('The normalized publication reason exceeds its stored bound.');
    const keyHash = digest(normalizeIdempotencyKey(key)),
      payloadHash = digest(input);
    try {
      return await withSerializableRetry({
        isContention: isPrismaTransactionConflict,
        conflictMessage:
          'Invoice visibility changed concurrently; reconcile the same request.',
        operation: () =>
          this.prisma.$transaction(
            async (tx) => {
              const rows = await tx.$queryRaw<
                { id: string }[]
              >`SELECT "id" FROM "InvoiceDocument" WHERE "id" = ${id} FOR UPDATE`;
              if (!rows.length) throw missing();
              const prior = await tx.invoicePublicationCommand.findUnique({
                where: {
                  actorId_documentId_keyHash: {
                    actorId,
                    documentId: id,
                    keyHash,
                  },
                },
                include: { event: true },
              });
              if (prior) {
                if (prior.payloadHash !== payloadHash)
                  throw new ConflictException({
                    code: 'IDEMPOTENCY_CONFLICT',
                    message: 'Publication retry payload changed.',
                  });
                return {
                  publication: publication({
                    ...prior.event,
                    updatedAt: prior.event.createdAt,
                  }),
                  replayed: true,
                };
              }
              const head = await tx.invoicePublication.findUnique({
                where: { documentId: id },
              });
              if (
                (head?.version ?? 0) !== expectedVersion ||
                (head?.isPublished ?? false) === input.isPublished
              )
                throw conflict();
              const document = await tx.invoiceDocument.findUniqueOrThrow({
                where: { id },
                select: { customer: { select: { status: true } } },
              });
              if (input.isPublished && document.customer.status !== 'ACTIVE')
                throw conflict();
              const now = new Date();
              const changed = await tx.invoicePublication.upsert({
                where: { documentId: id },
                create: {
                  documentId: id,
                  version: 1,
                  isPublished: true,
                  updatedAt: now,
                },
                update: {
                  version: { increment: 1 },
                  isPublished: input.isPublished,
                  updatedAt: now,
                },
              });
              const event = await tx.invoicePublicationEvent.create({
                data: {
                  documentId: id,
                  version: changed.version,
                  isPublished: changed.isPublished,
                  reason: input.reason,
                  actorId,
                  requestId,
                  createdAt: now,
                },
              });
              await tx.invoicePublicationCommand.create({
                data: {
                  documentId: id,
                  actorId,
                  keyHash,
                  payloadHash,
                  eventId: event.id,
                },
              });
              await this.audit.record(
                {
                  actorId,
                  requestId,
                  action: changed.isPublished
                    ? 'invoice.access.published'
                    : 'invoice.access.revoked',
                  entityType: 'invoice_document',
                  entityId: id,
                  metadata: {
                    publicationVersion: changed.version,
                    isPublished: changed.isPublished,
                  },
                },
                tx,
              );
              return { publication: publication(changed), replayed: false };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          ),
      });
    } catch (error) {
      return this.safeFailure(error);
    }
  }
  async customerRead(userId: string, id: string): Promise<CustomerInvoice> {
    if (typeof userId !== 'string' || !userId.trim()) throw missing();
    invoiceDraftId(id);
    try {
      const row = await this.prisma.invoiceDocument.findFirst({
        where: {
          id,
          customer: { userId, status: 'ACTIVE' },
          publication: { isPublished: true },
        },
        select: { snapshot: true },
      });
      if (!row) throw missing();
      return customerInvoice(row.snapshot as unknown as InvoiceDocument);
    } catch (error) {
      return this.safeFailure(error);
    }
  }
  async customerList(userId: string, offset = 0, limit = 25) {
    if (typeof userId !== 'string' || !userId.trim()) throw missing();
    bounded(offset, limit);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const where: Prisma.InvoiceDocumentWhereInput = {
            customer: { userId, status: 'ACTIVE' },
            publication: { isPublished: true },
          };
          const rows = await tx.invoiceDocument.findMany({
            where,
            skip: offset,
            take: limit,
            orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
            select: {
              id: true,
              number: true,
              orderId: true,
              issuedAt: true,
              grandTotal: true,
            },
          });
          return {
            items: rows.map((row) => ({
              id: row.id,
              number: row.number,
              orderId: row.orderId,
              issuedAt: row.issuedAt.toISOString(),
              total: {
                amount: row.grandTotal.toString(),
                currency: 'IRR' as const,
              },
            })),
            count: await tx.invoiceDocument.count({ where }),
            offset,
            limit,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    } catch (error) {
      return this.safeFailure(error);
    }
  }
  private safeFailure(error: unknown): never {
    if (error instanceof HttpException) throw error;
    new RedactedLogger().event('error', {
      event: 'invoice.publication.failed',
      outcome: 'unknown',
      errorCode: 'INVOICE_PUBLICATION_UNAVAILABLE',
    });
    throw new InternalServerErrorException({
      code: 'INVOICE_PUBLICATION_UNAVAILABLE',
      message:
        'Invoice access outcome could not be confirmed; reconcile before retrying.',
    });
  }
}
