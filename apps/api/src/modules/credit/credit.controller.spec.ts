import { CreditReturnController, CustomerCreditReturnController } from './credit-return.controller';
import { CreditReturnService } from './credit-return.service';
import { CreditCancelDto, CreditReturnDto, CreditRefundPayoutDto } from './credit.dto';
import { Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { CreditSaleController } from './credit-sale.controller';
import { CreditSaleService } from './credit-sale.service';
import { CreditSaleApprovalDto } from './credit.dto';
import { CreditController, CustomerCreditController } from './credit.controller';
import { CreditAdjustmentDto, CreditOpeningDto, CreditPageDto, CreditPolicyDto, CreditReceiptDto, CreditReversalDto } from './credit.dto';
import { PrismaService } from '../../database/prisma.service';
import { RedactedLogger } from '../../common/redacted-logger';
import { CreditService, creditAmount, MAX_CREDIT_IRR } from './credit.service';

Reflect.defineMetadata('design:paramtypes', [CreditReturnService], CreditReturnController);
Reflect.defineMetadata('design:paramtypes', [CreditReturnService], CustomerCreditReturnController);
for (const [method, types] of Object.entries({ list: [String,String,Object], cancel: [String,String,CreditCancelDto,String,Object], receive: [String,String,CreditReturnDto,String,Object], payout: [String,String,String,CreditRefundPayoutDto,String,Object] })) Reflect.defineMetadata('design:paramtypes', types, CreditReturnController.prototype, method);
Reflect.defineMetadata('design:paramtypes', [Object,String,Object], CustomerCreditReturnController.prototype, 'list');
Reflect.defineMetadata('design:paramtypes', [CreditSaleService], CreditSaleController);
Reflect.defineMetadata('design:paramtypes', [String, String, CreditSaleApprovalDto, String, Object], CreditSaleController.prototype, 'approve');
Reflect.defineMetadata('design:paramtypes', [CreditService], CreditController);
Reflect.defineMetadata('design:paramtypes', [CreditService], CustomerCreditController);
for (const [method, types] of Object.entries({ statement: [String, CreditPageDto], ledger: [String, CreditPageDto],
  policy: [Object, String, String, CreditPolicyDto], opening: [Object, String, String, CreditOpeningDto],
  receipt: [Object, String, String, CreditReceiptDto], reverseReceipt: [Object, String, String, String, CreditReversalDto],
  adjust: [Object, String, String, String, CreditAdjustmentDto],
})) Reflect.defineMetadata('design:paramtypes', types, CreditController.prototype, method);
Reflect.defineMetadata('design:paramtypes', [Object, CreditPageDto], CustomerCreditController.prototype, 'statement');
const service = Object.fromEntries(['statement', 'ledger', 'policy', 'opening', 'receipt', 'reverseReceipt', 'adjust', 'customerStatement', 'approve', 'list', 'cancel', 'receive', 'payout', 'customerList'].map(method => [method, vi.fn().mockResolvedValue({ account: null, documents: [], total: 0, offset: 0, limit: 25 })]));
const staff: AuthPrincipalContext = { userId: 'credit-staff', sessionId: 'isolated-session', tokenId: 'isolated-token', authenticationLevel: 'STAFF_MFA', authenticatedAt: new Date(), accessExpiresAt: new Date(Date.now() + 600_000), permissions: new Set(['credit.read', 'credit.manage', 'credit.opening', 'credit.receive', 'credit.adjust', 'credit.approve', 'orders.manage', 'inventory.adjust']) };
let current = staff;
const principals = { resolveBearerToken: vi.fn(async (authorization?: string) => {
  if (authorization !== 'Bearer isolated-test-token') throw new AuthSessionException('AUTH_SESSION_INVALID');
  return current;
}) };
@Module({ imports: [ApiFoundationModule], controllers: [CreditReturnController, CustomerCreditReturnController, CreditSaleController, CreditController, CustomerCreditController], providers: [
  { provide: CreditReturnService, useValue: service },
  { provide: CreditService, useValue: service },
  { provide: CreditSaleService, useValue: service },
  { provide: APP_GUARD, useValue: new AuthGuard(principals as unknown as AuthPrincipalService, { record: vi.fn() } as unknown as AuditLogService) },
] }) class CreditHttpTestModule {}
const at = '2026-10-01T12:00:00Z';
const policy = { expectedVersion: null, status: 'ACTIVE', creditLimit: '1000', termsDays: 30 };
const opening = { expectedVersion: 0, amount: '1000', issuedAt: at, dueAt: at, sourceReference: 'isolated-ledger-proof' };
const receipt = { expectedVersion: 1, amount: '100', method: 'CASH', effectiveAt: at, evidenceReference: 'isolated-receipt-proof', allocations: [{ documentId: 'own-document', amount: '100' }] };
const correction = { expectedVersion: 2, effectiveAt: at, evidenceReference: 'isolated-correction-proof', reason: 'Isolated correction' };
const cancellation = { expectedVersion: 0, expectedOrderVersion: 0, evidenceReference: 'isolated-return-proof', reason: 'Isolated compensation' };
const routes = [
  ['list', 'GET', '/own-customer/orders/own-order/returns', 'credit.read', undefined],
  ['cancel', 'POST', '/own-customer/orders/own-order/cancel', 'credit.adjust', cancellation],
  ['receive', 'POST', '/own-customer/orders/own-order/returns', 'credit.adjust', { ...cancellation, lines: [{ orderItemId: 'own-item', quantity: 1, warehouseId: 'warehouse', locationId: 'shelf' }] }],
  ['payout', 'POST', '/own-customer/orders/own-order/returns/own-return/payouts', 'credit.adjust', { expectedVersion: 0, amount: '100', method: 'CASH', effectiveAt: at, evidenceReference: 'isolated-payout-proof', reason: 'Actual test evidence' }],
  ['approve', 'POST', '/own-customer/orders/own-order/approve', 'credit.approve', { expectedVersion: 0, expectedOrderVersion: 0 }],
  ['statement', 'GET', '/own-customer', 'credit.read', undefined],
  ['ledger', 'GET', '/own-customer/ledger', 'credit.read', undefined],
  ['policy', 'POST', '/own-customer/policy', 'credit.manage', policy],
  ['opening', 'POST', '/own-customer/opening', 'credit.opening', opening],
  ['receipt', 'POST', '/own-customer/receipts', 'credit.receive', receipt],
  ['reverseReceipt', 'POST', '/own-customer/receipts/own-receipt/reverse', 'credit.adjust', correction],
  ['adjust', 'POST', '/own-customer/documents/own-document/adjust', 'credit.adjust', { ...correction, kind: 'CREDIT_NOTE', amount: '1' }],
] as const;

describe('Credit server permission, fresh MFA and strict HTTP contract', () => {
  let app: INestApplication; let origin: string;
  beforeAll(async () => {
    app = await NestFactory.create(CreditHttpTestModule, { logger: false });
    app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { vi.clearAllMocks(); current = { ...staff, authenticatedAt: new Date() }; });
  const request = (method: string, path: string, body?: unknown, authenticated = true, self = false) => fetch(`${origin}/api/v1/${self ? 'customers/me/credit' : 'credit/admin/customers'}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'credit-http-idempotency', ...(authenticated ? { Authorization: 'Bearer isolated-test-token' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  it.each(routes)('%s rejects anonymous, customer or missing permission without invoking the service', async (name, method, path, _permission, body) => {
    expect((await request(method, path, body, false)).status).toBe(401);
    current = { ...staff, authenticationLevel: 'CUSTOMER_OTP' };
    expect((await request(method, path, body)).status).toBe(403);
    current = { ...staff, permissions: new Set() };
    expect((await request(method, path, body)).status).toBe(403);
    expect(service[name]).not.toHaveBeenCalled();
  });
  it.each(routes.filter(route => route[1] === 'POST'))('%s requires fresh MFA and does not mistake stale authentication for a lost session', async (name, method, path, _permission, body) => {
    current = { ...staff, authenticatedAt: new Date(Date.now() - 6 * 60_000) };
    const response = await request(method, path, body);
    expect(response.status).toBe(401); expect(await response.json()).toMatchObject({ code: 'AUTH_REAUTHENTICATION_REQUIRED' });
    expect(service[name]).not.toHaveBeenCalled();
    expect((await request('GET', '/own-customer')).status).toBe(200);
  });
  it.each(routes)('%s accepts a correctly authorized request with its declared contract', async (name, method, path, _permission, body) => {
    const response = await request(method, path, body);
    expect(response.status).toBe(method === 'POST' ? 201 : 200);
    expect(service[name]).toHaveBeenCalledOnce();
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('enforces stock/order and payout permissions and rejects injected financial terms or actors', async () => {
    current = { ...staff, permissions: new Set(['credit.adjust']) };
    expect((await request('POST','/own-customer/orders/own-order/cancel',cancellation)).status).toBe(403);
    const payout = { expectedVersion: 0, amount: '100', method: 'CASH', effectiveAt: at, evidenceReference: 'isolated-payout-proof', reason: 'Actual test evidence' };
    expect((await request('POST','/own-customer/orders/own-order/returns/own-return/payouts',payout)).status).toBe(403);
    current = staff;
    for (const field of [{ amount: '0' },{ status: 'PAID' },{ actorId: 'forged' },{ refundDue: '0' }]) expect((await request('POST','/own-customer/orders/own-order/cancel',{ ...cancellation,...field })).status).toBe(400);
    expect(service.cancel).not.toHaveBeenCalled(); expect(service.payout).not.toHaveBeenCalled();
  });
  it('customer return projections use only the authenticated principal, not body/query ownership', async () => {
    current = { ...staff, userId: 'customer-A', authenticationLevel: 'CUSTOMER_OTP', permissions: new Set() };
    expect((await request('GET','/orders/own-order/returns',undefined,true,true)).status).toBe(200);
    expect(service.customerList).toHaveBeenCalledWith('customer-A','own-order');
    expect((await request('GET','/orders/own-order/returns?customerId=customer-B',undefined,true,true)).status).toBe(400);
  });
  it('requires order-management permission as well as credit approval and rejects injected amounts', async () => {
    current = { ...staff, permissions: new Set(['credit.approve']) };
    const body = { expectedVersion: 0, expectedOrderVersion: 0 };
    expect((await request('POST', '/own-customer/orders/own-order/approve', body)).status).toBe(403);
    expect(service.approve).not.toHaveBeenCalled();
    current = staff;
    expect((await request('POST', '/own-customer/orders/own-order/approve', { ...body, amount: '1', status: 'PAID' })).status).toBe(400);
    expect(service.approve).not.toHaveBeenCalled();
    expect((await request('POST', '/own-customer/orders/own-order/approve', body)).status).toBe(201);
    expect(service.approve).toHaveBeenCalledWith('own-customer', 'own-order', body, expect.objectContaining({ actorId: staff.userId }));
  });
  it('passes only authenticated actor and middleware request ID; no caller-supplied actor or balance is allowed', async () => {
    expect((await request('POST', '/own-customer/policy', { ...policy, actorId: 'forged', balance: '0' })).status).toBe(400);
    expect(service.policy).not.toHaveBeenCalled();
    const response = await request('POST', '/own-customer/policy', policy);
    expect(response.status).toBe(201);
    expect(service.policy).toHaveBeenCalledWith('own-customer', policy, expect.objectContaining({ actorId: staff.userId, idempotencyKey: 'credit-http-idempotency', requestId: expect.any(String) }));
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('customer self endpoint rejects anonymous/revoked sessions and URL/query ownership overrides', async () => {
    expect((await request('GET', '', undefined, false, true)).status).toBe(401);
    current = { ...staff, userId: 'customer-A', authenticationLevel: 'CUSTOMER_OTP', permissions: new Set() };
    const response = await request('GET', '', undefined, true, true);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
    expect(service.customerStatement).toHaveBeenCalledWith('customer-A', { offset: 0, limit: 25 });
    expect((await request('GET', '?customerId=customer-B', undefined, true, true)).status).toBe(400);
    expect((await request('GET', '/customer-B', undefined, true, true)).status).toBe(404);
    principals.resolveBearerToken.mockRejectedValueOnce(new AuthSessionException('AUTH_SESSION_INVALID'));
    expect((await request('GET', '', undefined, true, true)).status).toBe(401);
    expect(service.customerStatement).toHaveBeenCalledTimes(1);
  });
  it.each(['1.5', '-1', '01', '۱۰۰', 100])('rejects noncanonical money %s at the HTTP boundary', async amount => {
    expect((await request('POST', '/own-customer/opening', { ...opening, amount })).status).toBe(400);
    expect(service.opening).not.toHaveBeenCalled();
  });
  it('bounds pages, versions, evidence and allocation counts and never accepts an arbitrary status', async () => {
    for (const query of ['?limit=101', '?offset=-1', '?offset=1000001', '?limit=NaN']) expect((await request('GET', `/own-customer${query}`)).status).toBe(400);
    for (const input of [{ ...policy, termsDays: 366 }, { ...policy, expectedVersion: -1 }, { ...policy, status: 'PAID' }]) expect((await request('POST', '/own-customer/policy', input)).status).toBe(400);
    expect((await request('POST', '/own-customer/receipts', { ...receipt, allocations: [] })).status).toBe(400);
    expect((await request('POST', '/own-customer/receipts', { ...receipt, evidenceReference: 'x'.repeat(129) })).status).toBe(400);
    expect((await request('POST', '/own-customer/receipts', { ...receipt, allocations: Array.from({ length: 101 }, () => receipt.allocations[0]) })).status).toBe(400);
  });
});

describe('Credit integer IRR range', () => {
  it('preserves amounts beyond safe-number precision through the BIGINT boundary', () => {
    expect(creditAmount('9007199254740993')).toBe(9007199254740993n);
    expect(creditAmount(MAX_CREDIT_IRR.toString())).toBe(MAX_CREDIT_IRR);
  });
  it.each(['0', '-1', '1.1', '01', '1e3', ' 1', '9223372036854775808'])('rejects unsupported debit %s before persistence', value => {
    expect(() => creditAmount(value)).toThrow();
  });
});


describe('Credit failure privacy and calendar validation', () => {
  it('sanitizes unexpected database failures before the global filter can log raw financial evidence', async () => {
    const privateReference = 'isolated-bank-evidence-must-not-be-logged';
    const prisma = { $transaction: vi.fn().mockRejectedValue(new Error(privateReference)) };
    const event = vi.spyOn(RedactedLogger.prototype, 'event').mockImplementation(() => undefined);
    const credit = new CreditService(prisma as unknown as PrismaService, {} as AuditLogService);
    await expect(credit.policy('customer', { expectedVersion: null, status: 'SUSPENDED', creditLimit: '0', termsDays: 0 }, { actorId: 'staff', requestId: 'safe-request', idempotencyKey: 'safe-key' })).rejects.toMatchObject({ response: { code: 'CREDIT_COMMAND_FAILED' } });
    expect(event).toHaveBeenCalledWith('error', expect.objectContaining({ errorCode: 'CREDIT_COMMAND_FAILED', data: { requestId: 'safe-request' } }));
    expect(JSON.stringify(event.mock.calls)).not.toContain(privateReference);
  });
  it.each(['2026-02-31T12:00:00Z', '2026-10-01', '2026-10-01T12:00:00'])('rejects ambiguous or nonexistent calendar timestamp %s before any transaction', async issuedAt => {
    const transaction = vi.fn(); const credit = new CreditService({ $transaction: transaction } as unknown as PrismaService, {} as AuditLogService);
    await expect(credit.opening('customer', { expectedVersion: 0, amount: '1', issuedAt, dueAt: '2026-10-31T12:00:00Z', sourceReference: 'isolated-proof' }, { actorId: 'staff', requestId: 'safe-request', idempotencyKey: 'safe-key' })).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    expect(transaction).not.toHaveBeenCalled();
  });
});
