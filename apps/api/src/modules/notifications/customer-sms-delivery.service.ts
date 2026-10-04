import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxEffectKind, OutboxEffectStatus } from '@prisma/client';
import type { EnvironmentVariables } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { SMS_PROVIDER, SMS_TEMPLATE_RESOLVER, type SmsProvider, type SmsSendResult, type SmsTemplateResolver } from './sms-provider';

const KINDS = [
  OutboxEffectKind.CUSTOMER_ORDER_PAID,
  OutboxEffectKind.CUSTOMER_SHIPMENT_DISPATCHED,
  OutboxEffectKind.CUSTOMER_SHIPMENT_DELIVERED,
] as const;
const MAX_ATTEMPTS = 8;

@Injectable()
export class CustomerSmsDeliveryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Optional() @Inject(SMS_TEMPLATE_RESOLVER) private readonly templates?: SmsTemplateResolver,
  ) {}

  /** A bounded worker pass. FAILED is the durable pre-send claim: a crash or
   * ambiguous upstream response can never trigger an automatic duplicate SMS. */
  async dispatchBatch(): Promise<{ claimed: number; accepted: number; pending: number; failed: number }> {
    const now = new Date();
    const candidates = await this.prisma.outboxEffect.findMany({
      where: { kind: { in: [...KINDS] }, status: OutboxEffectStatus.PENDING, nextAttemptAt: { lte: now } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 25,
      select: { id: true, kind: true, subjectId: true, attemptCount: true },
    });
    let claimed = 0;
    let accepted = 0;
    let pending = 0;
    let failed = 0;
    for (const effect of candidates) {
      const attemptCount = effect.attemptCount + 1;
      const claim = await this.prisma.outboxEffect.updateMany({
        where: { id: effect.id, status: OutboxEffectStatus.PENDING, attemptCount: effect.attemptCount },
        data: {
          status: OutboxEffectStatus.FAILED, attemptCount, lastAttemptAt: new Date(),
          lastResultCode: 'CLAIMED_UNCERTAIN',
        },
      });
      if (claim.count !== 1) continue;
      claimed++;
      const templateId = await this.templateId(effect.kind);
      const order = await this.prisma.order.findUnique({
        where: { id: effect.subjectId },
        select: { number: true, customer: { select: { mobile: true } } },
      });
      if (!order || !templateId || order.number.length > 25) {
        await this.record(effect.id, attemptCount, { status: 'rejected', reason: 'invalid_request' });
        failed++;
        continue;
      }
      let result: SmsSendResult;
      try {
        result = await this.provider.send({
          purpose: this.purpose(effect.kind), destination: order.customer.mobile,
          templateId, parameters: { Order: order.number }, correlationId: effect.id,
        });
      } catch {
        // The provider may have accepted the request before throwing.
        result = { status: 'unknown_result' };
      }
      await this.record(effect.id, attemptCount, result);
      if (result.status === 'accepted') accepted++;
      else if (result.status === 'rate_limited' && attemptCount < MAX_ATTEMPTS) pending++;
      else failed++;
    }
    return { claimed, accepted, pending, failed };
  }

  private async templateId(kind: OutboxEffectKind): Promise<number | undefined> {
    if (this.templates) return this.templates.resolve(this.purpose(kind));
    if (kind === OutboxEffectKind.CUSTOMER_ORDER_PAID) return this.config.get('SMS_IR_ORDER_PAID_TEMPLATE_ID', { infer: true });
    if (kind === OutboxEffectKind.CUSTOMER_SHIPMENT_DISPATCHED) return this.config.get('SMS_IR_SHIPMENT_DISPATCHED_TEMPLATE_ID', { infer: true });
    return this.config.get('SMS_IR_SHIPMENT_DELIVERED_TEMPLATE_ID', { infer: true });
  }

  private purpose(kind: OutboxEffectKind): 'order_paid' | 'shipment_dispatched' | 'shipment_delivered' {
    if (kind === OutboxEffectKind.CUSTOMER_ORDER_PAID) return 'order_paid';
    if (kind === OutboxEffectKind.CUSTOMER_SHIPMENT_DISPATCHED) return 'shipment_dispatched';
    return 'shipment_delivered';
  }

  private async record(id: string, attemptCount: number, result: SmsSendResult): Promise<void> {
    // A network failure or upstream 5xx can be post-acceptance; only an explicit
    // rate-limit response is safe to retry automatically.
    const retryable = result.status === 'rate_limited';
    const retry = retryable && attemptCount < MAX_ATTEMPTS;
    const delay = Math.min(15 * 60_000, 1_000 * 2 ** (attemptCount - 1));
    await this.prisma.outboxEffect.updateMany({
      where: { id, status: OutboxEffectStatus.FAILED, attemptCount },
      data: {
        status: result.status === 'accepted' ? OutboxEffectStatus.COMPLETED : retry ? OutboxEffectStatus.PENDING : OutboxEffectStatus.FAILED,
        nextAttemptAt: retry ? new Date(Date.now() + delay) : undefined,
        lastResultCode: result.status === 'rejected' ? `rejected_${result.reason}` : result.status,
        providerMessageId: result.status === 'accepted' ? result.providerMessageId : undefined,
      },
    });
  }
}
