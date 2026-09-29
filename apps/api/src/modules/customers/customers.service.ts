import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type Customer as CustomerRow,
  type CustomerAddress as CustomerAddressRow,
  type CustomerStatus as CustomerStatusPrisma,
  type OrderStatus as OrderStatusPrisma,
  type PaymentStatus as PaymentStatusPrisma,
  type FulfillmentStatus as FulfillmentStatusPrisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  AdminCustomerAddress,
  AdminCustomerAuditEntry,
  AdminCustomerDetail,
  AdminCustomerNote,
  AdminCustomerOrder,
  AdminCustomerSummary,
  CustomerNoteVisibility,
} from '@iranyaragh/contracts';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { maskIdentifier, maskText } from '../../common/masking';
import { retryDelayMs, sleep } from '../../common/retry';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { normalizeIranianMobile } from '../auth/mobile';
import type {
  CustomerAddressesDto,
  CustomerCreateDto,
  CustomerListQueryDto,
  CustomerNoteDto,
  CustomerUpdateDto,
} from './customers.dto';

const keyPattern = /^[A-Za-z0-9_-]{8,96}$/u;
const RECENT_ORDER_LIMIT = 20;

/** Prisma rejects anything but these lowercase literals in an `orderBy`. */
const CUSTOMER_ORDER_DIRECTIONS = new Set(['asc', 'desc'] as const);
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return `{${Object.keys(object).sort(byCodeUnit).map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', message: 'Customer not found.' });
}

function stale(): ConflictException {
  return new ConflictException({ code: 'VERSION_CONFLICT', message: 'Customer changed; reload before editing.' });
}

function mobileConflict(): ConflictException {
  return new ConflictException({ code: 'CUSTOMER_MOBILE_CONFLICT', message: 'A customer with this mobile already exists.' });
}

function invalidMobile(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_ERROR', message: 'mobile must be a valid Iranian mobile number.' });
}

/**
 * Canonical E.164 form for a stored customer/address mobile.
 *
 * Persian and Arabic-Indic digits are folded here rather than only in the DTO
 * transform, because this is also the guard every internal caller passes
 * through. If normalization lived only at the edge, a future service-level
 * caller could write a non-canonical value and break the unique index and OTP
 * customer linkage that assume E.164.
 */
export function canonicalMobile(raw: string): string {
  const ascii = raw.replace(/[\u06F0-\u06F9]/gu, (d) => String(d.charCodeAt(0) - 0x06F0));
  const normalized = normalizeIranianMobile(ascii);
  if (!normalized) throw invalidMobile();
  return normalized.value;
}

function displayName(first: string | null, last: string | null): string | null {
  const joined = [first, last].filter((part): part is string => Boolean(part?.trim())).join(' ');
  return joined || null;
}

function publicAddress(row: CustomerAddressRow): AdminCustomerAddress {
  return {
    id: row.id,
    label: row.label,
    receiverName: row.receiverName,
    mobile: row.mobile,
    provinceCode: row.provinceCode,
    city: row.city,
    addressLine: row.addressLine,
    postalCode: row.postalCode,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The note row plus its masked author projection from `detailSelect`. */
type CustomerNoteRowWithAuthor = {
  id: string;
  visibility: CustomerNoteVisibility;
  body: string;
  createdAt: Date;
  createdBy: { id: string; firstName: string | null; lastName: string | null };
};

function publicNote(row: CustomerNoteRowWithAuthor): AdminCustomerNote {
  const name = displayName(row.createdBy.firstName, row.createdBy.lastName);
  return {
    id: row.id,
    visibility: row.visibility,
    body: row.body,
    author: { id: row.createdBy.id, displayNameMasked: name ? maskText(name) : null },
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Order history deliberately carries no address or contact PII. A customer read
 * must not become a wider window onto delivery addresses than `orders.read`
 * already is, so only the order's own money and state is projected here.
 */
type OrderHistoryRow = {
  id: string;
  number: string;
  status: OrderStatusPrisma;
  grandTotal: bigint;
  createdAt: Date;
  payments: Array<{ status: PaymentStatusPrisma }>;
  fulfillment: { status: FulfillmentStatusPrisma } | null;
};

function publicOrder(row: OrderHistoryRow): AdminCustomerOrder {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    grandTotal: { amount: row.grandTotal.toString(), currency: 'IRR' },
    paymentStatus: row.payments[0]?.status ?? null,
    fulfillmentStatus: row.fulfillment?.status ?? null,
    placedAt: row.createdAt.toISOString(),
  };
}

const summarySelect = {
  id: true,
  mobile: true,
  firstName: true,
  lastName: true,
  status: true,
  version: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { orders: true } },
} satisfies Prisma.CustomerSelect;

/**
 * One projection for the customer detail shape. This select was previously
 * duplicated at each call site, so adding a field to one read but not another
 * was a silent, easy-to-miss inconsistency.
 */
const detailSelect = {
  ...summarySelect,
  deactivatedAt: true,
  addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
  notes: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  },
  orders: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: RECENT_ORDER_LIMIT,
    select: {
      id: true,
      number: true,
      status: true,
      grandTotal: true,
      createdAt: true,
      payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
      fulfillment: { select: { status: true } },
    },
  },
} satisfies Prisma.CustomerSelect;

function publicSummary(row: {
  id: string;
  mobile: string;
  firstName: string | null;
  lastName: string | null;
  status: CustomerStatusPrisma;
  version: number;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { orders: number };
}): AdminCustomerSummary {
  return {
    id: row.id,
    mobile: row.mobile,
    firstName: row.firstName,
    lastName: row.lastName,
    status: row.status,
    version: row.version,
    orderCount: row._count.orders,
    hasUserAccount: row.userId !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type CommandContext = { actorId: string; requestId: string | null; idempotencyKey: string };

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list(query: CustomerListQueryDto): Promise<{ items: AdminCustomerSummary[]; total: number }> {
    const where: Prisma.CustomerWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.hasUserAccount !== undefined) {
      where.userId = query.hasUserAccount ? { not: null } : null;
    }
    if (query.search) {
      // Operator search accepts a name fragment or any tail of the number, so
      // "+9891212" and "09121" both find the same record.
      const needle = query.search.trim();
      // Strip separators and a leading '+' so '+98…', '98…' and '09…' all reduce to
      // a digit tail that is a substring of the stored E.164 value.
      const mobileNeedle = needle.replace(/[\s\-()_]/gu, '').replace(/^\+/u, '');
      const or: Prisma.CustomerWhereInput[] = [
        { firstName: { contains: needle, mode: 'insensitive' } },
        { lastName: { contains: needle, mode: 'insensitive' } },
      ];
      // Only widen to the mobile column when the needle actually looks like a
      // number, so a Persian name search does not run a useless trailing LIKE
      // on the unique index.
      if (/^\d{3,}$/u.test(mobileNeedle)) or.push({ mobile: { contains: mobileNeedle } });
      where.OR = or;
    }

    // A directory reads best with names and numbers ascending, but recency and
    // order count are most useful newest/most-active first.
    const sortField = query.sortBy ?? 'createdAt';
    const naturalOrder: Record<string, Prisma.SortOrder> = {
      firstName: 'asc',
      lastName: 'asc',
      mobile: 'asc',
    };
    // Prisma only accepts the lowercase direction literals, so the value is
    // re-checked here rather than trusted from the query. Sorting by anything
    // else previously reached Prisma verbatim and failed the whole request.
    const direction =
      query.sortDir && CUSTOMER_ORDER_DIRECTIONS.has(query.sortDir)
        ? query.sortDir
        : naturalOrder[sortField] ?? 'desc';
    const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
      sortField === 'orderCount'
        ? [{ orders: { _count: 'desc' } }, { id: 'desc' }]
        : [{ [sortField]: direction }, { id: 'desc' }];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: summarySelect,
        orderBy,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items: rows.map(publicSummary), total };
  }

  async get(id: string): Promise<AdminCustomerDetail> {
    const row = await this.prisma.customer.findUnique({
      where: { id },
      select: detailSelect,
    });
    if (!row) throw notFound();
    return {
      ...publicSummary(row),
      deactivatedAt: row.deactivatedAt ? row.deactivatedAt.toISOString() : null,
      addresses: row.addresses.map(publicAddress),
      notes: row.notes.map(publicNote),
      recentOrders: row.orders.map(publicOrder),
    };
  }

  async history(id: string, query: CustomerListQueryDto): Promise<{ items: AdminCustomerAuditEntry[]; total: number }> {
    if (!(await this.prisma.customer.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
    const where = { entityType: 'Customer', entityId: id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: { id: true, action: true, actorId: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), total };
  }

  async create(input: CustomerCreateDto, context: CommandContext): Promise<AdminCustomerSummary> {
    const payload = {
      mobile: canonicalMobile(input.mobile),
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
    };
    try {
      return await this.command('create', payload, context, async (tx) => {
        const row = await tx.customer.create({ data: payload, select: summarySelect });
        await this.audit.record(
          {
            action: 'customer.created',
            entityType: 'Customer',
            entityId: row.id,
            actorId: context.actorId,
            requestId: context.requestId,
            metadata: { mobileMasked: maskIdentifier(row.mobile, 5, 3), hasUserAccount: row.userId !== null },
          },
          tx,
        );
        return publicSummary(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw mobileConflict();
      }
      throw error;
    }
  }

  async update(id: string, input: CustomerUpdateDto, context: CommandContext): Promise<AdminCustomerSummary> {
    const changes: Record<string, unknown> = {};
    if (input.firstName !== undefined) changes.firstName = input.firstName;
    if (input.lastName !== undefined) changes.lastName = input.lastName;
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'At least one customer field must change.' });
    }
    return this.command(`update:${id}`, { expectedVersion: input.expectedVersion, ...changes }, context, async (tx) => {
      const existing = await this.guardVersion(tx, id, input.expectedVersion);
      const changed = await tx.customer.updateMany({
        where: { id, version: input.expectedVersion },
        data: { ...changes, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw stale();
      const row = await tx.customer.findUniqueOrThrow({ where: { id }, select: summarySelect });
      await this.audit.record(
        {
          action: 'customer.updated',
          entityType: 'Customer',
          entityId: id,
          actorId: context.actorId,
          requestId: context.requestId,
          metadata: { changedFields: Object.keys(changes), fromVersion: existing.version, toVersion: row.version },
        },
        tx,
      );
      return publicSummary(row);
    });
  }

  /**
   * Replaces the address set and, optionally, the lifecycle status, in one
   * versioned command. Deactivation clears on reactivation and is recorded as a
   * distinct audit action.
   */
  async replaceAddresses(id: string, input: CustomerAddressesDto, context: CommandContext): Promise<AdminCustomerDetail> {
    const normalized = input.addresses.map((address) => ({
      label: address.label,
      receiverName: address.receiverName,
      mobile: canonicalMobile(address.mobile),
      provinceCode: address.provinceCode,
      city: address.city,
      addressLine: address.addressLine,
      postalCode: address.postalCode ?? null,
      isDefault: address.isDefault ?? false,
    }));
    const defaults = normalized.filter((address) => address.isDefault).length;
    if (normalized.length > 0 && defaults === 0) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Mark exactly one address as default.' });
    }
    if (defaults > 1) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Only one address can be the default.' });
    }

    return this.command(
      `addresses:${id}`,
      { expectedVersion: input.expectedVersion, addresses: normalized, status: input.status ?? null },
      context,
      async (tx) => {
        const existing = await this.guardVersion(tx, id, input.expectedVersion);
        await tx.customerAddress.deleteMany({ where: { customerId: id } });
        if (normalized.length > 0) {
          await tx.customerAddress.createMany({ data: normalized.map((address) => ({ ...address, customerId: id })) });
        }
        const status = input.status ?? existing.status;
        if (status !== existing.status) {
          await tx.customer.updateMany({
            where: { id, version: input.expectedVersion },
            data: { status, deactivatedAt: status === 'INACTIVE' ? new Date() : null, version: { increment: 1 } },
          });
        } else {
          await tx.customer.updateMany({
            where: { id, version: input.expectedVersion },
            data: { version: { increment: 1 } },
          });
        }
        const row = await tx.customer.findUniqueOrThrow({
          where: { id },
          select: detailSelect,
        });
        const action =
          status !== existing.status
            ? status === 'INACTIVE'
              ? 'customer.deactivated'
              : 'customer.reactivated'
            : 'customer.addresses_replaced';
        await this.audit.record(
          {
            action,
            entityType: 'Customer',
            entityId: id,
            actorId: context.actorId,
            requestId: context.requestId,
            metadata: {
              addressCount: normalized.length,
              fromVersion: existing.version,
              toVersion: row.version,
              fromStatus: existing.status,
              toStatus: row.status,
            },
          },
          tx,
        );
        return {
          ...publicSummary(row),
          deactivatedAt: row.deactivatedAt ? row.deactivatedAt.toISOString() : null,
          addresses: row.addresses.map(publicAddress),
          notes: row.notes.map(publicNote),
          recentOrders: row.orders.map(publicOrder),
        };
      },
    );
  }

  async addNote(id: string, input: CustomerNoteDto, context: CommandContext): Promise<AdminCustomerDetail> {
    const visibility = input.visibility as CustomerNoteVisibility;
    return this.command(
      `note:${id}`,
      { expectedVersion: input.expectedVersion, visibility, body: input.body },
      context,
      async (tx) => {
        const existing = await this.guardVersion(tx, id, input.expectedVersion);
        const note = await tx.customerNote.create({
          data: { customerId: id, visibility, body: input.body, createdById: context.actorId },
          select: { id: true },
        });
        const row = await tx.customer.updateMany({
          where: { id, version: input.expectedVersion },
          data: { version: { increment: 1 } },
        });
        if (row.count !== 1) throw stale();
        await this.audit.record(
          {
            action: 'customer.note_added',
            entityType: 'Customer',
            entityId: id,
            actorId: context.actorId,
            requestId: context.requestId,
            metadata: { noteId: note.id, visibility, fromVersion: existing.version, toVersion: input.expectedVersion + 1 },
          },
          tx,
        );
        return this.readDetail(tx, id);
      },
    );
  }

  private async readDetail(tx: Prisma.TransactionClient, id: string): Promise<AdminCustomerDetail> {
    const row = await tx.customer.findUnique({
      where: { id },
      select: detailSelect,
    });
    if (!row) throw notFound();
    return {
      ...publicSummary(row),
      deactivatedAt: row.deactivatedAt ? row.deactivatedAt.toISOString() : null,
      addresses: row.addresses.map(publicAddress),
      notes: row.notes.map(publicNote),
      recentOrders: row.orders.map(publicOrder),
    };
  }

  private async guardVersion(
    tx: Prisma.TransactionClient,
    id: string,
    expectedVersion: number,
  ): Promise<CustomerRow> {
    const existing = await tx.customer.findUnique({ where: { id } });
    if (!existing) throw notFound();
    if (existing.version !== expectedVersion) throw stale();
    return existing;
  }

  private async command<TResult>(
    scope: string,
    payload: unknown,
    context: CommandContext,
    execute: (tx: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    if (!keyPattern.test(context.idempotencyKey ?? '')) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Idempotency-Key must contain 8-96 ASCII letters, digits, underscores or hyphens.',
      });
    }
    const keyHash = sha256(context.idempotencyKey);
    const payloadHash = sha256(stableJson(payload));
    const key = { actorId: context.actorId, scope, keyHash };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const [hi, lo] = advisoryLockIdKey('customer-command', context.actorId, scope, keyHash);
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
            const prior = await tx.customerCommandRecord.findUnique({ where: { actorId_scope_keyHash: key } });
            if (prior) {
              if (prior.payloadHash !== payloadHash) {
                throw new ConflictException({
                  code: 'IDEMPOTENCY_CONFLICT',
                  message: 'Key reused with another customer command.',
                });
              }
              if (prior.response === null) {
                throw new ConflictException({ code: 'CONFLICT', message: 'Command is still committing.' });
              }
              return prior.response as TResult;
            }
            const record = await tx.customerCommandRecord.create({ data: { ...key, payloadHash } });
            const result = await execute(tx);
            await tx.customerCommandRecord.update({
              where: { id: record.id },
              data: { response: result as Prisma.InputJsonValue },
            });
            return result;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 3) {
            await sleep(retryDelayMs(attempt));
            continue;
          }
          throw new ConflictException({
            code: 'RETRYABLE_CONFLICT',
            message: 'Concurrent customer command; retry with the same idempotency key.',
          });
        }
        throw error;
      }
    }
    throw new ConflictException({ code: 'RETRYABLE_CONFLICT', message: 'Customer command could not be committed.' });
  }
}
