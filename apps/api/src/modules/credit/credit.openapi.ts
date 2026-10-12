import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
const string = { type: 'string' } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;
const amount = { type: 'string', pattern: '^(0|[1-9][0-9]{0,18})$', description: 'Canonical integer IRR, at most signed BIGINT. Never Toman or floating-point.' } as const;
const version = { type: 'integer', minimum: 0, maximum: 2_147_483_647 } as const;
const object = (properties: Record<string, SchemaObject>, required = Object.keys(properties)): SchemaObject => ({ type: 'object', additionalProperties: false, properties, required });
const money = object({ amount: { type: 'string', pattern: '^-?(0|[1-9][0-9]{0,18})$' }, currency: { type: 'string', enum: ['IRR'] } });
const account = object({ id: string, customerId: string, status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] }, version,
  creditLimit: money, termsDays: { type: 'integer', minimum: 0, maximum: 365 }, outstanding: money, availableCredit: money,
  overdue: money, overLimit: { type: 'boolean' }, createdAt: timestamp, updatedAt: timestamp });
const document = object({ id: string, kind: { type: 'string', enum: ['OPENING_BALANCE'] }, originalAmount: money,
  effectivePrincipal: money, outstanding: money, status: { type: 'string', enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
  issuedAt: timestamp, dueAt: timestamp, termsDays: { type: 'integer' } });
const pagination = { total: { type: 'integer' } as const, offset: { type: 'integer' } as const, limit: { type: 'integer' } as const };
const evidence = { type: 'string', minLength: 1, maxLength: 128 } as const;
const reason = { type: 'string', minLength: 1, maxLength: 500 } as const;
const nullableString = { type: 'string', nullable: true } as const;
export const creditOpenApi = {
  statement: object({ account: { ...account, nullable: true }, documents: { type: 'array', items: document }, ...pagination }),
  ledger: object({ items: { type: 'array', items: object({ id: string, documentId: string, receiptId: nullableString, reversalOfId: nullableString,
    kind: { type: 'string', enum: ['OPENING_BALANCE', 'RECEIPT', 'RECEIPT_REVERSAL', 'DEBIT_ADJUSTMENT', 'CREDIT_NOTE'] },
    amount: money, effectiveAt: timestamp, createdAt: timestamp }) }, ...pagination }),
  result: object({ account, documentId: string, receiptId: string, entryIds: { type: 'array', items: string } }, ['account']),
  policy: object({ expectedVersion: { ...version, nullable: true }, status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] }, creditLimit: amount, termsDays: { type: 'integer', minimum: 0, maximum: 365 } }),
  opening: object({ expectedVersion: version, amount, issuedAt: timestamp, dueAt: timestamp, sourceReference: evidence }),
  receipt: object({ expectedVersion: version, amount, method: { type: 'string', enum: ['CASH', 'BANK_TRANSFER'] }, effectiveAt: timestamp, evidenceReference: evidence,
    allocations: { type: 'array', minItems: 1, maxItems: 100, items: object({ documentId: { ...string, minLength: 1, maxLength: 128 }, amount }) } }),
  reversal: object({ expectedVersion: version, effectiveAt: timestamp, evidenceReference: evidence, reason }),
  adjustment: object({ expectedVersion: version, effectiveAt: timestamp, evidenceReference: evidence, reason, kind: { type: 'string', enum: ['DEBIT_ADJUSTMENT', 'CREDIT_NOTE'] }, amount }),
};
