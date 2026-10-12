import { BadRequestException, ConflictException, HttpException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { CreditAccountSummary, CreditAdjustmentRequest, CreditCommandResult, CreditLedgerPage, CreditOpeningRequest, CreditPolicyRequest, CreditReceiptRequest, CreditReversalRequest, CreditStatement, Money } from '@iranyaragh/contracts';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { isPrismaTransactionConflict, withSerializableRetry } from '../../common/serializable-retry';
import { RedactedLogger } from '../../common/redacted-logger';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

export const MAX_CREDIT_IRR = 9_223_372_036_854_775_807n;
export type CreditContext = { actorId: string; requestId: string; idempotencyKey: string };
// Canonical hashes use binary code-unit order, independent of locale/ICU upgrades.
const compareKeys = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const money = (amount: bigint): Money => ({ amount: amount.toString(), currency: 'IRR' });
const invalid = (message: string) => new BadRequestException({ code: 'VALIDATION_ERROR', message });
const conflict = (code: string, message: string) => new ConflictException({ code, message });
const missing = () => new NotFoundException({ code: 'CREDIT_NOT_FOUND', message: 'Credit account or document not found.' });

export function creditAmount(value: string, allowZero = false): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/u.test(value)) throw invalid('Use a canonical integer IRR amount.');
  const amount = BigInt(value);
  if (amount > MAX_CREDIT_IRR || (!allowZero && amount === 0n)) throw invalid('IRR amount is outside the supported range.');
  return amount;
}
function text(value: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum || [...value].some(character => { const code = character.codePointAt(0)!; return code < 32 || code === 127; })) throw invalid('A bounded evidence reference or reason is required.');
  return value.trim().normalize('NFC');
}
function date(value: string, allowFuture = false): Date {
  // Require an explicit timezone; host-local date parsing must not change financial evidence.
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/u.test(value)) throw invalid('An ISO timestamp with timezone is required.');
  const calendar = new Date(`${value.slice(0, 19)}Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 19) !== value.slice(0, 19)) throw invalid('Invalid calendar timestamp.');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || (!allowFuture && parsed.getTime() > Date.now())) throw invalid('Invalid or future evidence timestamp.');
  return parsed;
}
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort(compareKeys).map(key => `${JSON.stringify(key)}:${stable(row[key])}`).join(',')}}`;
}
function page(input: { offset: number; limit: number }) {
  if (!Number.isInteger(input.offset) || input.offset < 0 || input.offset > 1_000_000 || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw invalid('Invalid statement pagination.');
  return input;
}

type Totals = { outstanding: string; overdue: string };
type DocumentBalance = { id: string; outstanding: string; principal: string; issuedAt: Date };

@Injectable()
export class CreditService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async statement(customerId: string, query: { offset: number; limit: number }): Promise<CreditStatement> {
    page(query);
    return this.prisma.$transaction(async tx => {
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!customer) throw missing();
      return this.statementIn(tx, customerId, query);
    }, { isolationLevel: 'RepeatableRead' });
  }

  async customerStatement(userId: string, query: { offset: number; limit: number }): Promise<CreditStatement> {
    page(query);
    return this.prisma.$transaction(async tx => {
      const customer = await tx.customer.findFirst({ where: { userId, status: 'ACTIVE' }, select: { id: true } });
      if (!customer) return { account: null, documents: [], total: 0, ...query };
      return this.statementIn(tx, customer.id, query);
    }, { isolationLevel: 'RepeatableRead' });
  }

  async ledger(customerId: string, query: { offset: number; limit: number }): Promise<CreditLedgerPage> {
    page(query);
    return this.prisma.$transaction(async tx => {
      const account = await tx.creditAccount.findUnique({ where: { customerId }, select: { id: true } });
      if (!account) throw missing();
      const where = { accountId: account.id };
      const [entries, total] = await Promise.all([
        tx.creditLedgerEntry.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: query.offset, take: query.limit,
          select: { id: true, documentId: true, receiptId: true, reversalOfId: true, kind: true, amount: true, effectiveAt: true, createdAt: true } }),
        tx.creditLedgerEntry.count({ where }),
      ]);
      return { items: entries.map(entry => ({ ...entry, amount: money(entry.amount), effectiveAt: entry.effectiveAt.toISOString(), createdAt: entry.createdAt.toISOString() })), total, ...query };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async policy(customerId: string, input: CreditPolicyRequest, context: CreditContext): Promise<CreditCommandResult> {
    const creditLimit = creditAmount(input.creditLimit, true);
    if (!['ACTIVE', 'SUSPENDED'].includes(input.status) || !Number.isInteger(input.termsDays) || input.termsDays < 0 || input.termsDays > 365) throw invalid('Invalid account status or payment terms.');
    this.versionInput(input.expectedVersion, true);
    return this.command(customerId, 'policy', input, context, async tx => {
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, status: true } });
      if (!customer) throw missing();
      if (input.status === 'ACTIVE' && customer.status !== 'ACTIVE') throw conflict('CUSTOMER_INACTIVE', 'An inactive customer cannot receive active credit.');
      const current = await tx.creditAccount.findUnique({ where: { customerId } });
      if ((current?.version ?? null) !== input.expectedVersion) throw conflict('CREDIT_VERSION_CONFLICT', 'Credit policy changed; reload before continuing.');
      const account = current
        ? await tx.creditAccount.update({ where: { id: current.id }, data: { status: input.status, creditLimit, termsDays: input.termsDays, version: { increment: 1 } } })
        : await tx.creditAccount.create({ data: { customerId, status: input.status, creditLimit, termsDays: input.termsDays } });
      await this.record(tx, 'credit.policy.updated', account.id, context, { status: input.status, creditLimit: input.creditLimit, termsDays: input.termsDays, version: account.version });
      return { account: await this.summary(tx, account.id) };
    });
  }

  async opening(customerId: string, input: CreditOpeningRequest, context: CreditContext): Promise<CreditCommandResult> {
    const amount = creditAmount(input.amount);
    const issuedAt = date(input.issuedAt); const dueAt = date(input.dueAt, true);
    const sourceReference = text(input.sourceReference, 128);
    const termsDays = Math.ceil((dueAt.getTime() - issuedAt.getTime()) / 86_400_000);
    if (termsDays < 0 || termsDays > 365) throw invalid('Opening due date must be within 365 days of issuance.');
    return this.command(customerId, 'opening', { ...input, sourceReference }, context, async tx => {
      const account = await this.account(tx, customerId, input.expectedVersion);
      if (await tx.receivableDocument.count({ where: { accountId: account.id, kind: 'OPENING_BALANCE' } })) throw conflict('CREDIT_OPENING_EXISTS', 'An opening balance already exists; append an evidenced correction.');
      await this.checkDebtBound(tx, account.id, amount);
      const document = await tx.receivableDocument.create({ data: { accountId: account.id, kind: 'OPENING_BALANCE', amount, issuedAt, dueAt, termsDays, sourceReference, actorId: context.actorId, requestId: context.requestId } });
      const entry = await tx.creditLedgerEntry.create({ data: { accountId: account.id, documentId: document.id, kind: 'OPENING_BALANCE', amount, effectiveAt: issuedAt, actorId: context.actorId, requestId: context.requestId } });
      await this.record(tx, 'credit.opening.recorded', document.id, context, { accountId: account.id, amount: input.amount });
      return { account: await this.summary(tx, account.id), documentId: document.id, entryIds: [entry.id] };
    });
  }

  async receipt(customerId: string, input: CreditReceiptRequest, context: CreditContext): Promise<CreditCommandResult> {
    const amount = creditAmount(input.amount); const effectiveAt = date(input.effectiveAt);
    const evidenceReference = text(input.evidenceReference, 128);
    if (!['CASH', 'BANK_TRANSFER'].includes(input.method) || !Array.isArray(input.allocations) || input.allocations.length < 1 || input.allocations.length > 100) throw invalid('A receipt needs a supported method and 1–100 allocations.');
    const allocations = input.allocations.map(item => ({ documentId: text(item.documentId, 128), amount: creditAmount(item.amount).toString() })).sort((a, b) => compareKeys(a.documentId, b.documentId));
    if (new Set(allocations.map(item => item.documentId)).size !== allocations.length || allocations.reduce((sum, item) => sum + BigInt(item.amount), 0n) !== amount) throw invalid('Allocations must be distinct and exactly equal the receipt amount.');
    return this.command(customerId, 'receipt', { ...input, evidenceReference, allocations }, context, async tx => {
      const account = await this.account(tx, customerId, input.expectedVersion);
      const evidenceHash = hash(evidenceReference.normalize('NFKC').toUpperCase());
      if (await tx.creditReceipt.findUnique({ where: { evidenceHash }, select: { id: true } })) throw conflict('CREDIT_EVIDENCE_CONFLICT', 'This receipt evidence was already recorded.');
      const balances = await this.balances(tx, account.id, allocations.map(item => item.documentId));
      for (const item of allocations) {
        const balance = balances.find(row => row.id === item.documentId);
        if (!balance) throw missing();
        if (effectiveAt < balance.issuedAt) throw invalid('Receipt cannot precede the debt document.');
        if (BigInt(item.amount) > BigInt(balance.outstanding)) throw conflict('CREDIT_ALLOCATION_CONFLICT', 'Receipt allocation exceeds the document outstanding balance.');
      }
      const receipt = await tx.creditReceipt.create({ data: { accountId: account.id, amount, method: input.method, evidenceReference, evidenceHash, effectiveAt, actorId: context.actorId, requestId: context.requestId } });
      const entryIds: string[] = [];
      for (const item of allocations) {
        const entry = await tx.creditLedgerEntry.create({ data: { accountId: account.id, documentId: item.documentId, receiptId: receipt.id, kind: 'RECEIPT', amount: -BigInt(item.amount), effectiveAt, actorId: context.actorId, requestId: context.requestId } });
        entryIds.push(entry.id);
      }
      await this.record(tx, 'credit.receipt.recorded', receipt.id, context, { accountId: account.id, amount: input.amount, method: input.method, allocationCount: allocations.length });
      return { account: await this.summary(tx, account.id), receiptId: receipt.id, entryIds };
    });
  }

  async reverseReceipt(customerId: string, receiptId: string, input: CreditReversalRequest, context: CreditContext): Promise<CreditCommandResult> {
    const effectiveAt = date(input.effectiveAt); const reason = text(input.reason, 500); const evidenceReference = text(input.evidenceReference, 128);
    return this.command(customerId, `reverse:${receiptId}`, { ...input, reason, evidenceReference }, context, async tx => {
      const account = await this.account(tx, customerId, input.expectedVersion);
      const receipt = await tx.creditReceipt.findFirst({ where: { id: receiptId, accountId: account.id }, include: { entries: { where: { kind: 'RECEIPT' }, include: { reversal: { select: { id: true } } } } } });
      if (!receipt) throw missing();
      if (receipt.entries.length === 0 || receipt.entries.some(entry => entry.reversal)) throw conflict('CREDIT_RECEIPT_REVERSED', 'The receipt is already reversed or has no allocation.');
      if (effectiveAt < receipt.effectiveAt) throw invalid('Reversal cannot precede its receipt.');
      await this.checkDebtBound(tx, account.id, receipt.amount);
      const entryIds: string[] = [];
      for (const original of receipt.entries) {
        const entry = await tx.creditLedgerEntry.create({ data: { accountId: account.id, documentId: original.documentId, receiptId, reversalOfId: original.id, kind: 'RECEIPT_REVERSAL', amount: -original.amount, effectiveAt, evidenceReference, reason, actorId: context.actorId, requestId: context.requestId } });
        entryIds.push(entry.id);
      }
      await this.record(tx, 'credit.receipt.reversed', receiptId, context, { accountId: account.id, amount: receipt.amount.toString(), allocationCount: receipt.entries.length });
      return { account: await this.summary(tx, account.id), receiptId, entryIds };
    });
  }

  async adjust(customerId: string, documentId: string, input: CreditAdjustmentRequest, context: CreditContext): Promise<CreditCommandResult> {
    const unsigned = creditAmount(input.amount); const effectiveAt = date(input.effectiveAt);
    const reason = text(input.reason, 500); const evidenceReference = text(input.evidenceReference, 128);
    if (!['DEBIT_ADJUSTMENT', 'CREDIT_NOTE'].includes(input.kind)) throw invalid('Invalid adjustment kind.');
    const amount = input.kind === 'CREDIT_NOTE' ? -unsigned : unsigned;
    return this.command(customerId, `adjust:${documentId}`, { ...input, reason, evidenceReference }, context, async tx => {
      const account = await this.account(tx, customerId, input.expectedVersion);
      const balance = (await this.balances(tx, account.id, [documentId]))[0];
      if (!balance) throw missing();
      if (effectiveAt < balance.issuedAt) throw invalid('Correction cannot precede the debt document.');
      if (BigInt(balance.outstanding) + amount < 0n) throw conflict('CREDIT_ADJUSTMENT_CONFLICT', 'A credit note cannot exceed unpaid debt; use the approved refund flow for returned money.');
      if (BigInt(balance.principal) + amount > MAX_CREDIT_IRR) throw invalid('Adjusted principal exceeds the supported IRR range.');
      await this.checkDebtBound(tx, account.id, amount);
      const evidenceHash = hash(stable([account.id, documentId, evidenceReference.normalize('NFKC').toUpperCase()]));
      if (await tx.creditLedgerEntry.findUnique({ where: { evidenceHash }, select: { id: true } })) throw conflict('CREDIT_EVIDENCE_CONFLICT', 'This adjustment evidence was already recorded.');
      const entry = await tx.creditLedgerEntry.create({ data: { accountId: account.id, documentId, kind: input.kind, amount, effectiveAt, reason, evidenceReference, evidenceHash, actorId: context.actorId, requestId: context.requestId } });
      await this.record(tx, 'credit.document.adjusted', documentId, context, { accountId: account.id, kind: input.kind, amount: amount.toString() });
      return { account: await this.summary(tx, account.id), documentId, entryIds: [entry.id] };
    });
  }

  private async statementIn(tx: Prisma.TransactionClient, customerId: string, query: { offset: number; limit: number }): Promise<CreditStatement> {
    const account = await tx.creditAccount.findUnique({ where: { customerId }, select: { id: true } });
    if (!account) return { account: null, documents: [], total: 0, ...query };
    const where = { accountId: account.id };
    const [summary, rows, total] = await Promise.all([
      this.summary(tx, account.id),
      tx.receivableDocument.findMany({ where, orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }], skip: query.offset, take: query.limit,
        select: { id: true, kind: true, amount: true, issuedAt: true, dueAt: true, termsDays: true } }),
      tx.receivableDocument.count({ where }),
    ]);
    const balances = await this.balances(tx, account.id, rows.map(row => row.id));
    const now = Date.now();
    return { account: summary, documents: rows.map(row => {
      const balance = balances.find(item => item.id === row.id);
      if (!balance) throw conflict('CREDIT_RECONCILIATION_REQUIRED', 'Document ledger evidence is missing.');
      const outstanding = BigInt(balance.outstanding); const principal = BigInt(balance.principal);
      return { id: row.id, kind: row.kind, originalAmount: money(row.amount), effectivePrincipal: money(principal), outstanding: money(outstanding),
        status: outstanding === 0n ? 'PAID' : row.dueAt.getTime() < now ? 'OVERDUE' : outstanding < principal ? 'PARTIALLY_PAID' : 'UNPAID',
        issuedAt: row.issuedAt.toISOString(), dueAt: row.dueAt.toISOString(), termsDays: row.termsDays };
    }), total, ...query };
  }

  private async balances(tx: Prisma.TransactionClient, accountId: string, ids: string[]): Promise<DocumentBalance[]> {
    if (!ids.length) return [];
    return tx.$queryRaw<DocumentBalance[]>`SELECT d."id", d."issuedAt", SUM(e."amount")::text AS outstanding,
      SUM(CASE WHEN e."kind"::text IN ('OPENING_BALANCE','DEBIT_ADJUSTMENT','CREDIT_NOTE') THEN e."amount" ELSE 0 END)::text AS principal
      FROM "ReceivableDocument" d JOIN "CreditLedgerEntry" e ON e."documentId" = d."id" AND e."accountId" = d."accountId"
      WHERE d."accountId" = ${accountId} AND d."id" IN (${Prisma.join(ids)}) GROUP BY d."id"`;
  }

  private async summary(tx: Prisma.TransactionClient, id: string): Promise<CreditAccountSummary> {
    const account = await tx.creditAccount.findUniqueOrThrow({ where: { id }, include: { customer: { select: { status: true } } } });
    const [totals] = await tx.$queryRaw<Totals[]>`SELECT COALESCE(SUM(b.amount),0)::text AS outstanding,
      COALESCE(SUM(CASE WHEN b."dueAt" < CURRENT_TIMESTAMP AND b.amount > 0 THEN b.amount ELSE 0 END),0)::text AS overdue
      FROM (SELECT d."id", d."dueAt", COALESCE(SUM(e."amount"),0) AS amount FROM "ReceivableDocument" d
        LEFT JOIN "CreditLedgerEntry" e ON e."documentId" = d."id" AND e."accountId" = d."accountId"
        WHERE d."accountId" = ${id} GROUP BY d."id") b`;
    const outstanding = BigInt(totals.outstanding); const overdue = BigInt(totals.overdue);
    const available = account.status === 'ACTIVE' && account.customer.status === 'ACTIVE' && overdue === 0n && account.creditLimit > outstanding ? account.creditLimit - outstanding : 0n;
    return { id: account.id, customerId: account.customerId, status: account.status, version: account.version,
      creditLimit: money(account.creditLimit), termsDays: account.termsDays, outstanding: money(outstanding),
      availableCredit: money(available), overdue: money(overdue), overLimit: outstanding > account.creditLimit,
      createdAt: account.createdAt.toISOString(), updatedAt: account.updatedAt.toISOString() };
  }

  private async account(tx: Prisma.TransactionClient, customerId: string, expectedVersion: number) {
    this.versionInput(expectedVersion);
    const account = await tx.creditAccount.findUnique({ where: { customerId } });
    if (!account) throw missing();
    if (account.version !== expectedVersion) throw conflict('CREDIT_VERSION_CONFLICT', 'Account changed; reload before continuing.');
    return account;
  }
  private versionInput(version: number | null, allowNull = false) {
    if (allowNull && version === null) return;
    if (!Number.isInteger(version) || version === null || version < 0 || version > 2_147_483_647) throw invalid('A valid expectedVersion is required.');
  }
  private async checkDebtBound(tx: Prisma.TransactionClient, accountId: string, delta: bigint) {
    const summary = await this.summary(tx, accountId);
    const result = BigInt(summary.outstanding.amount) + delta;
    if (result < 0n || result > MAX_CREDIT_IRR) throw invalid('Account balance is outside the supported IRR range.');
  }
  private record(tx: Prisma.TransactionClient, action: string, entityId: string, context: CreditContext, metadata: Prisma.InputJsonObject) {
    return this.audit.record({ action, entityType: 'credit', entityId, actorId: context.actorId, requestId: context.requestId, metadata }, tx);
  }

  private async command(customerId: string, command: string, payload: unknown, context: CreditContext,
    execute: (tx: Prisma.TransactionClient) => Promise<CreditCommandResult>): Promise<CreditCommandResult> {
    const keyHash = hash(normalizeIdempotencyKey(context.idempotencyKey));
    const payloadHash = hash(stable(payload));
    // Store hashes rather than a resource ID in the bounded command scope.
    const scope = `credit:${hash(`${customerId}:${command}`)}`;
    if (!context.actorId || !context.requestId || context.requestId.length > 100) throw invalid('A tracked actor and request are required.');
    try {
      return await withSerializableRetry({ isContention: isPrismaTransactionConflict, operation: () => this.prisma.$transaction(async tx => {
        // A customer-scoped lock also serializes first account creation. Every posting
        // updates account.version in the database trigger, making stale snapshots conflict.
        const [hi, lo] = advisoryLockIdKey('credit-account', customerId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
        const key = { actorId: context.actorId, scope, keyHash };
        const prior = await tx.creditCommandRecord.findUnique({ where: { actorId_scope_keyHash: key } });
        if (prior) {
          if (prior.payloadHash !== payloadHash) throw conflict('IDEMPOTENCY_CONFLICT', 'Key reused with a different credit command.');
          if (!prior.response) throw conflict('CREDIT_COMMAND_CONFLICT', 'Command has not completed.');
          return prior.response as unknown as CreditCommandResult;
        }
        const record = await tx.creditCommandRecord.create({ data: { ...key, payloadHash } });
        const response = await execute(tx);
        await tx.creditCommandRecord.update({ where: { id: record.id }, data: { response: response as unknown as Prisma.InputJsonValue } });
        return response;
      }, { isolationLevel: 'Serializable' }), conflictMessage: 'Concurrent credit command; retry with the same key.' });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict('CREDIT_EVIDENCE_CONFLICT', 'This financial evidence was already recorded.');
      if (error instanceof HttpException) throw error;
      // Prisma diagnostics can contain the submitted bank evidence or reason.
      // Log only the stable error class/code; never stringify the raw exception.
      new RedactedLogger().event('error', { event: 'credit.command.failed', outcome: 'failure',
        errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'CREDIT_COMMAND_FAILED',
        data: { requestId: context.requestId } });
      throw new InternalServerErrorException({ code: 'CREDIT_COMMAND_FAILED', message: 'Credit command could not be confirmed; reload and retry with the same idempotency key.' });
    }
  }
}
