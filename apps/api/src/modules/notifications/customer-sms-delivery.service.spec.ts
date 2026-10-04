import { ConfigService } from '@nestjs/config';
import { OutboxEffectKind, OutboxEffectStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { FakeSmsProvider } from './fake-sms.provider';
import type { SmsSendResult } from './sms-provider';
import { CustomerSmsDeliveryService } from './customer-sms-delivery.service';

function setup(
  result: SmsSendResult = { status: 'accepted', providerMessageId: '42' },
  kind: OutboxEffectKind = OutboxEffectKind.CUSTOMER_ORDER_PAID,
) {
  const effect = {
    id: 'effect-1', kind,
    subjectId: 'order-1', status: OutboxEffectStatus.PENDING,
    attemptCount: 0, nextAttemptAt: new Date(0), lastResultCode: null as string | null,
    providerMessageId: null as string | null,
  };
  const prisma = {
    outboxEffect: {
      findMany: vi.fn(async () => effect.status === OutboxEffectStatus.PENDING && effect.nextAttemptAt <= new Date()
        ? [{ id: effect.id, kind: effect.kind, subjectId: effect.subjectId, attemptCount: effect.attemptCount }]
        : []),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: OutboxEffectStatus; attemptCount: number }; data: Record<string, unknown> }) => {
        if (where.id !== effect.id || where.status !== effect.status || where.attemptCount !== effect.attemptCount) return { count: 0 };
        // Prisma ignores undefined fields; preserve NULL delivery evidence.
        Object.assign(effect, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
        return { count: 1 };
      }),
    },
    order: { findUnique: vi.fn(async () => ({ number: 'IRY-123456789-ABCDEF', customer: { mobile: '+989121234567' } })) },
  };
  const provider = new FakeSmsProvider(result);
  const config = { get: vi.fn((key: string) => ({ SMS_IR_ORDER_PAID_TEMPLATE_ID: 123, SMS_IR_SHIPMENT_DISPATCHED_TEMPLATE_ID: 124, SMS_IR_SHIPMENT_DELIVERED_TEMPLATE_ID: 125 } as Record<string, number>)[key]) };
  const service = new CustomerSmsDeliveryService(
    prisma as unknown as PrismaService, provider, config as unknown as ConfigService,
  );
  return { effect, prisma, provider, config, service };
}

describe('CustomerSmsDeliveryService', () => {
  it('accepts one paid-order SMS with no customer PII in result evidence', async () => {
    const { service, effect, provider } = setup();
    expect(await service.dispatchBatch()).toEqual({ claimed: 1, accepted: 1, pending: 0, failed: 0 });
    expect(provider.requests).toEqual([{
      purpose: 'order_paid', destination: '+989121234567', templateId: 123,
      parameters: { Order: 'IRY-123456789-ABCDEF' }, correlationId: 'effect-1',
    }]);
    expect(effect).toMatchObject({ status: OutboxEffectStatus.COMPLETED, attemptCount: 1, providerMessageId: '42', lastResultCode: 'accepted' });
    expect(await service.dispatchBatch()).toMatchObject({ claimed: 0 });
  });

  it.each([
    [{ status: 'unknown_result' } as const, 'unknown_result'],
    [{ status: 'unavailable' } as const, 'unavailable'],
    [{ status: 'rejected', reason: 'template' } as const, 'rejected_template'],
  ])('never automatically resends an ambiguous or rejected result', async (result, code) => {
    const { service, effect, provider } = setup(result);
    expect(await service.dispatchBatch()).toMatchObject({ claimed: 1, failed: 1 });
    expect(effect).toMatchObject({ status: OutboxEffectStatus.FAILED, attemptCount: 1, lastResultCode: code });
    await service.dispatchBatch();
    expect(provider.requests).toHaveLength(1);
  });

  it('retries explicit rate limiting with bounded delay and a stable correlation ID', async () => {
    const { service, effect, provider } = setup({ status: 'rate_limited' });
    expect(await service.dispatchBatch()).toMatchObject({ claimed: 1, pending: 1 });
    expect(effect).toMatchObject({ status: OutboxEffectStatus.PENDING, attemptCount: 1, lastResultCode: 'rate_limited' });
    expect(effect.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await service.dispatchBatch();
    expect(provider.requests).toHaveLength(1);
  });

  it.each([
    [OutboxEffectKind.CUSTOMER_SHIPMENT_DISPATCHED, 'shipment_dispatched'],
    [OutboxEffectKind.CUSTOMER_SHIPMENT_DELIVERED, 'shipment_delivered'],
  ] as const)('uses a separate configured template for %s', async (kind, purpose) => {
    const { service, provider, config } = setup({ status: 'accepted', providerMessageId: '42' }, kind);
    await service.dispatchBatch();
    expect(provider.requests[0]).toMatchObject({ purpose, templateId: kind === OutboxEffectKind.CUSTOMER_SHIPMENT_DISPATCHED ? 124 : 125 });
    expect(config.get).toHaveBeenCalledWith(
      kind === OutboxEffectKind.CUSTOMER_SHIPMENT_DISPATCHED
        ? 'SMS_IR_SHIPMENT_DISPATCHED_TEMPLATE_ID' : 'SMS_IR_SHIPMENT_DELIVERED_TEMPLATE_ID',
      { infer: true },
    );
  });

  it('treats a thrown provider error as uncertain and does not retry', async () => {
    const { service, effect, provider } = setup();
    provider.send = vi.fn().mockRejectedValue(new Error('private response'));
    await service.dispatchBatch();
    expect(effect).toMatchObject({ status: OutboxEffectStatus.FAILED, lastResultCode: 'unknown_result' });
    await service.dispatchBatch();
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it('stops after the eighth explicit rate limit', async () => {
    const { service, effect } = setup({ status: 'rate_limited' });
    effect.attemptCount = 7;
    expect(await service.dispatchBatch()).toMatchObject({ claimed: 1, failed: 1 });
    expect(effect).toMatchObject({ status: OutboxEffectStatus.FAILED, attemptCount: 8, lastResultCode: 'rate_limited' });
  });

  it('does not send after losing the atomic claim', async () => {
    const { service, prisma, provider } = setup();
    prisma.outboxEffect.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.dispatchBatch()).toMatchObject({ claimed: 0 });
    expect(provider.requests).toHaveLength(0);
  });

  it('fails closed when the template is missing', async () => {
    const { service, effect, provider, config } = setup();
    config.get.mockReturnValue(undefined);
    expect(await service.dispatchBatch()).toMatchObject({ failed: 1 });
    expect(effect.status).toBe(OutboxEffectStatus.FAILED);
    expect(provider.requests).toHaveLength(0);
  });
  it('never records disabled delivery success or retries it', async () => {
    const { service, effect, provider } = setup({ status: 'disabled' });
    expect(await service.dispatchBatch()).toMatchObject({ accepted: 0, failed: 1 });
    expect(effect).toMatchObject({ status: OutboxEffectStatus.FAILED, providerMessageId: null, lastResultCode: 'disabled' });
    await service.dispatchBatch();
    expect(provider.requests).toHaveLength(1);
  });

  it('restart never reclaims a pre-dispatch uncertain claim', async () => {
    const { effect, prisma, provider, config } = setup();
    effect.status = OutboxEffectStatus.FAILED;
    effect.lastResultCode = 'CLAIMED_UNCERTAIN';
    const restarted = new CustomerSmsDeliveryService(prisma as unknown as PrismaService, provider,
      config as unknown as ConfigService);
    expect(await restarted.dispatchBatch()).toMatchObject({ claimed: 0, accepted: 0 });
    expect(provider.requests).toHaveLength(0);
  });

});

describe('Customer SMS dynamic template configuration', () => {
  it.each([
    [OutboxEffectKind.CUSTOMER_ORDER_PAID, 'order_paid'],
    [OutboxEffectKind.CUSTOMER_SHIPMENT_DISPATCHED, 'shipment_dispatched'],
    [OutboxEffectKind.CUSTOMER_SHIPMENT_DELIVERED, 'shipment_delivered'],
  ] as const)('resolves the currently stored template for %s', async (kind, purpose) => {
    const { prisma, provider, config } = setup(undefined, kind);
    const resolve = vi.fn().mockResolvedValue(901);
    const service = new CustomerSmsDeliveryService(prisma as unknown as PrismaService, provider, config as unknown as ConfigService, { resolve });
    await service.dispatchBatch();
    expect(resolve).toHaveBeenCalledWith(purpose);
    expect(provider.requests[0]?.templateId).toBe(901);
    expect(config.get).not.toHaveBeenCalled();
  });
});
