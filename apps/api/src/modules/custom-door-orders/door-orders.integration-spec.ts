import { OrderReadService } from '../orders/order-read.service';
import { CustomerOrderListQueryDto } from '../orders/order-read.dto';
import { ConfigService } from "@nestjs/config";
import { OutboxConsumerService } from "../outbox/outbox-consumer.service";
import { CustomerSmsDeliveryService } from "../notifications/customer-sms-delivery.service";
import { SmsTemplateSettingsService } from "../notifications/sms-template-settings.service";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../database/prisma.service";
import { assertIsolatedTestDatabase } from "../../test/database-url.guard";
import { AuditLogService } from "../audit/audit-log.service";
import { InventoryService } from "../inventory/inventory.service";
import { DoorCatalogService } from "./door-catalog.service";
import { DoorOrdersService, type DoorActor } from "./door-orders.service";
import { DoorFilesService } from "./door-files.service";
import { pricingFixture } from "./door.test-fixtures";
import { PaymentInitiationService } from "../payments/payment-initiation.service";
import { PaymentVerificationService } from "../payments/payment-verification.service";
import { AdminPaymentRefundService } from "../payments/admin-payment-refund.service";
import { OrderCommandService } from "../orders/order-command.service";
import { InvoiceDraftService } from "../invoices/invoice-draft.service";
import { InvoiceDocumentService } from "../invoices/invoice-document.service";
import { InvoicePolicyService } from "../invoices/invoice-policy.service";
import type {
  PaymentGatewayConfig,
  PaymentProvider,
} from "../payments/payment-provider.port";
import type {
  DoorModel,
  DoorMaterial,
  DoorOrderView,
} from "@iranyaragh/contracts";
import type { MediaService } from "../media/media.service";
import type { ProductMediaStorage } from "../media/storage.port";
import type { StaffOrderService } from "../orders/staff-order.service";
import type { ConfiguredShippingQuoteAdapter } from "../orders/configured-shipping-quote.adapter";

/** Real PostgreSQL transactions, synthetic TEST ONLY data and mock provider.
 * No remote sales database or live financial provider may be used here. */
describe.sequential("Custom door orders PostgreSQL integration", () => {
  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const inventory = new InventoryService(prisma, audit);
  const catalog = new DoorCatalogService(prisma, audit, {
    listPicker: vi.fn(),
  } as unknown as MediaService);
  const service = new DoorOrdersService(prisma, catalog, audit, inventory);
  const refunds = new AdminPaymentRefundService(prisma, audit);
  const genericOrders = new OrderCommandService(prisma, audit, inventory);
  const invoiceDrafts = new InvoiceDraftService(
    prisma,
    audit,
    {} as StaffOrderService,
    {} as ConfiguredShippingQuoteAdapter,
  );
  const policies = new InvoicePolicyService(prisma, audit);
  const documents = new InvoiceDocumentService(
    prisma,
    audit,
    invoiceDrafts,
    policies,
  );
  const run = randomUUID().replaceAll("-", "").slice(0, 12);
  const provider: PaymentProvider = {
    providerName: "zarinpal",
    authorize: vi.fn(async () => ({
      status: "redirect" as const,
      authority: `TEST-${randomUUID()}`,
      redirectUrl: "https://sandbox.zarinpal.com/pg/StartPay/TEST",
    })),
    verify: vi.fn(async () => ({
      status: "verified" as const,
      referenceId: `TEST-REF-${randomUUID()}`,
    })),
  };
  const gateway: PaymentGatewayConfig = {
    providerName: "zarinpal",
    mode: "sandbox",
    callbackUrl: "https://example.test/callback",
    timeoutMs: 1000,
  };
  const initiation = new PaymentInitiationService(prisma, provider, gateway);
  const verification = new PaymentVerificationService(
    prisma,
    provider,
    gateway,
    audit,
    inventory,
  );
  let actor: DoorActor, staff: DoorActor, other: DoorActor;
  let model: DoorModel,
    materials: DoorMaterial[],
    variantId: string,
    warehouseId: string,
    locationId: string,
    addressId: string;
  const key = () => `door-test-${randomUUID()}`;
  const commandActor = (base: DoorActor) => ({ ...base, requestId: key() });
  const inputs = () => ({
    items: [
      {
        ...pricingFixture().item,
        modelId: model.id,
        selections: materials.map((m) => ({
          slot: m.code.split("-").slice(-1)[0],
          materialId: m.id,
        })),
      },
    ],
  });
  async function create(accept = false) {
    let order = await service.create(commandActor(actor), inputs(), key());
    if (accept)
      order = await service.accept(
        commandActor(actor),
        order.id,
        order.version,
        key(),
      );
    return order;
  }
  async function historicalDeposit(order: DoorOrderView, amount: bigint) {
    // Synthetic TEST ONLY attempt already open under the previous release.
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id, provider: "zarinpal", amount,
        status: "PENDING", authority: `TEST-${randomUUID()}`,
        idempotencyKey: key(), idempotencyFingerprint: "0".repeat(64),
        gatewayEnvironment: "sandbox",
        doorAllocation: { create: { quoteId: order.quote.id, purpose: "DEPOSIT" } },
      },
    });
    await verification.verify({ authority: payment.authority!, status: "OK", requestId: key() });
    return service.detail(actor, order.id);
  }
  async function pay(order: DoorOrderView) {
    const attempt = await initiation.initiate({
      userId: actor.userId,
      orderId: order.id,
      idempotencyKey: key(),
      requestId: key(),
    });
    await verification.verify({
      authority: attempt.data.payment.authority,
      status: "OK",
      requestId: key(),
    });
    return service.detail(actor, order.id);
  }
  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    const a = await prisma.user.create({
      data: { email: `door-customer-${run}@example.test`, status: "ACTIVE" },
    });
    const b = await prisma.user.create({
      data: { email: `door-staff-${run}@example.test`, status: "ACTIVE" },
    });
    const c = await prisma.user.create({
      data: { email: `door-other-${run}@example.test`, status: "ACTIVE" },
    });
    actor = { userId: a.id, requestId: key() };
    staff = { userId: b.id, requestId: key(), staff: true };
    other = { userId: c.id, requestId: key() };
    const customer = await prisma.customer.create({
      data: {
        userId: a.id,
        mobile: `+989${(BigInt(`0x${run}`) % 1000000000n).toString().padStart(9, "0")}`,
        firstName: "TEST ONLY",
        lastName: "Door buyer",
      },
    });
    const address = await prisma.customerAddress.create({
      data: {
        customerId: customer.id,
        label: "TEST ONLY",
        receiverName: "TEST ONLY",
        mobile: customer.mobile,
        provinceCode: "TEH",
        city: "تهران",
        addressLine: "نشانی آزمون جداگانه",
        postalCode: "1234567890",
      },
    });
    addressId = address.id;
    const product = await prisma.product.create({
      data: {
        name: "TEST ONLY door material",
        slug: `door-test-${run}`,
        status: "ACTIVE",
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `DOOR-TEST-${run}`,
        skuKey: `door-test-${run}`,
        combinationSignature: "",
        salePrice: 1000n,
        status: "ACTIVE",
        isActive: true,
      },
    });
    variantId = variant.id;
    warehouseId = (
      await prisma.warehouse.create({
        data: { code: `DOOR-${run}`, name: "TEST ONLY" },
      })
    ).id;
    locationId = (
      await prisma.warehouseLocation.create({
        data: { warehouseId, code: `DOOR-${run}` },
      })
    ).id;
    await prisma.inventoryBalance.create({
      data: {
        variantId,
        warehouseId,
        locationId,
        onHand: 100,
        reserved: 0,
        available: 100,
      },
    });
    const f = pricingFixture();
    for (const material of f.materials)
      await catalog.writeMaterial(staff.userId, key(), {
        code: `fixture-${run}-${material.id}`,
        title: material.title,
        category: material.category,
        active: true,
        variantId: material.id === "hinge" ? variantId : null,
        expectedVersion: 0,
        configuration: {
          ...material.configuration,
          stockUnit: material.id === "hinge" ? "PIECE" : null,
        },
      });
    const all = await catalog.catalog(true);
    materials = all.materials.filter((m) =>
      m.code.startsWith(`fixture-${run}-`),
    );
    // Database ordering is by title; preserve logical slot identity explicitly.
    materials.sort(
      (a, b) =>
        ["glass", "profile", "hinge"].indexOf(a.code.split("-").slice(-1)[0]) -
        ["glass", "profile", "hinge"].indexOf(b.code.split("-").slice(-1)[0]),
    );
    f.cfg.slots = f.cfg.slots.map((s) => ({
      ...s,
      materialIds: [materials.find((m) => m.code.endsWith(`-${s.key}`))!.id],
    }));
    await catalog.writeModel(staff.userId, key(), {
      code: `fixture-${run}-model`,
      title: "TEST ONLY MODEL",
      type: "FORMLEX",
      active: true,
      imageMediaId: null,
      expectedVersion: 0,
      configuration: f.cfg,
    });
    model = (await catalog.catalog(true)).models.find(
      (m) => m.code === `fixture-${run}-model`,
    )!;
  });
  afterAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    if (!actor) {
      await prisma.$disconnect();
      return;
    }
    const orders = await prisma.order.findMany({
      where: { customer: { userId: actor.userId } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    const payments = await prisma.payment.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true },
    });
    const paymentIds = payments.map((p) => p.id);
    // This suite's append-only records cannot be deleted by application APIs.
    // TRUNCATE is strictly confined to the guarded disposable *_test database.
    await prisma.$executeRawUnsafe(
      'TRUNCATE "OrderReturnRefund", "OrderReturnLine", "OrderReturn", "DoorOrder", "DoorModel", "DoorMaterial", "DoorCatalogRevision", "DoorCommand", "Refund", "InvoiceDraft", "InvoicePolicyRevision", "InvoiceSeriesCounter" CASCADE',
    );
    await prisma.outboxEffect.deleteMany({
      where: { event: { aggregateId: { in: [...orderIds, ...paymentIds] } } },
    });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...orderIds, ...paymentIds] } },
    });
    await prisma.paymentTransition.deleteMany({
      where: { paymentId: { in: paymentIds } },
    });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.orderTransition.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    if (variantId) {
      await prisma.inventoryMovement.deleteMany({ where: { variantId } });
      await prisma.stockReservation.deleteMany({ where: { variantId } });
      await prisma.inventoryBalance.deleteMany({ where: { variantId } });
      const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
      });
      await prisma.productVariant.deleteMany({ where: { id: variantId } });
      if (variant)
        await prisma.product.deleteMany({ where: { id: variant.productId } });
    }
    if (locationId)
      await prisma.warehouseLocation.deleteMany({ where: { id: locationId } });
    if (warehouseId)
      await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.customer.deleteMany({ where: { userId: actor.userId } });
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [actor.userId, staff.userId, other.userId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [actor.userId, staff.userId, other.userId] } },
    });
    await prisma.$disconnect();
  });

  it("persists manufacturing through create, detail and draft replacement while keeping old quote positions", async () => {
    const manufacturing = { profileColor: "GOLD", handleSide: "LEFT", hingeSide: "RIGHT", drillingMode: "CUSTOM", holes: [120, 350, 650, 880].map(distanceMm => ({ distanceMm, reference: "TOP" as const })) } as const;
    const firstInput = { items: [{ ...inputs().items[0], manufacturing }] };
    let order = await service.create(commandActor(actor), firstInput, key(), true);
    expect(order.items[0].manufacturing).toEqual(manufacturing);
    expect(order.quote.snapshot.lines[0].manufacturing).toEqual(manufacturing);
    expect((await service.detail(actor, order.id)).items[0].manufacturing).toEqual(manufacturing);
    const next = { ...manufacturing, profileColor: "WHITE" as const, holes: manufacturing.holes.map(hole => ({ ...hole, reference: "BOTTOM" as const })) };
    order = await service.replaceDraft(commandActor(actor), order.id, { items: [{ ...inputs().items[0], manufacturing: next }] }, order.version, key());
    expect(order.items[0].manufacturing).toEqual(next);
    expect(order.quote.snapshot.lines[0].manufacturing).toEqual(next);
    expect(order.quotes.find(quote => quote.version === 1)?.snapshot.lines[0].manufacturing).toEqual(manufacturing);
    await expect(service.replaceDraft(commandActor(actor), order.id, { items: [{ ...inputs().items[0], manufacturing: { ...next, holes: next.holes.map(hole => ({ ...hole, distanceMm: 1001 })) } }] }, order.version, key())).rejects.toMatchObject({ status: 400 });
    expect((await service.detail(actor, order.id)).items[0].manufacturing).toEqual(next);
  });

  it("creates several doors exactly once under concurrent retries and blocks IDOR", async () => {
    const input = inputs();
    input.items.push({ ...input.items[0], widthMm: 1000, quantity: 2 });
    const idem = key();
    const results = await Promise.all([
      service.create(commandActor(actor), input, idem),
      service.create(commandActor(actor), input, idem),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(results[0].items).toHaveLength(2);
    expect(results[0].quote.approved).toBe(true);
    expect(results[0].requirements).toHaveLength(6);
    const ordinary = new OrderReadService(prisma);
    const ordinaryPage = await ordinary.listCustomerOrders(actor.userId, Object.assign(new CustomerOrderListQueryDto(), { page: 1, perPage: 25, sortDir: 'desc' }));
    expect(ordinaryPage.data.items).toHaveLength(0);
    await expect(ordinary.getCustomerOrder(actor.userId, results[0].id)).rejects.toMatchObject({ status: 404 });

    await expect(service.detail(other, results[0].id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.accept(other, results[0].id, results[0].version, key()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.create(
        commandActor(actor),
        { items: [{ ...input.items[0], widthMm: 2000 }] },
        idem,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("recomputes only editable drafts and never rewrites an old quotation", async () => {
    let order = await service.create(
      commandActor(actor),
      inputs(),
      key(),
      true,
    );
    expect(order.status).toBe("DRAFT");
    const first = order.quote.id;
    order = await service.replaceDraft(
      commandActor(actor),
      order.id,
      { items: [{ ...inputs().items[0], widthMm: 800 }] },
      order.version,
      key(),
    );
    expect(order.quote.id).not.toBe(first);
    expect(order.quotes).toHaveLength(2);
    order = await service.submitDraft(
      commandActor(actor),
      order.id,
      order.version,
      key(),
    );
    expect(order.status).toBe("AWAITING_DEPOSIT");
    await expect(
      service.replaceDraft(
        commandActor(actor),
        order.id,
        inputs(),
        order.version,
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("routes unusual dimensions to manual quote, preserves payments through amendment and requires reacceptance", async () => {
    let order = await service.create(
      commandActor(actor),
      { items: [{ ...inputs().items[0], widthMm: 4000 }] },
      key(),
    );
    expect(order.status).toBe("PENDING_QUOTE_APPROVAL");
    await expect(
      initiation.initiate({
        userId: actor.userId,
        orderId: order.id,
        idempotencyKey: key(),
        requestId: key(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    order = await service.approveQuote(
      commandActor(staff),
      order.id,
      {
        expectedVersion: order.version,
        total: "100000",
        lineTotals: [{ total: "99000", reason: "TEST ONLY approved line" }],
        adjustments: [{ title: "TEST ONLY special work", amount: "1000" }],
        reason: "TEST ONLY technical review",
      },
      key(),
    );
    order = await service.accept(
      commandActor(actor),
      order.id,
      order.version,
      key(),
    );
    expect(order.quote.snapshot).not.toHaveProperty("deposit");
    expect(
      (await prisma.doorQuotation.findUniqueOrThrow({ where: { id: order.quote.id } })).deposit,
    ).toBe(100000n);
    order = await historicalDeposit(order, 30000n);
    expect(order.paid).toBe("30000");
    order = await service.approveQuote(
      commandActor(staff),
      order.id,
      {
        expectedVersion: order.version,
        total: "120000",
        lineTotals: [{ total: "120000", reason: "TEST ONLY amended line" }],
        adjustments: [],
        reason: "TEST ONLY controlled amendment",
      },
      key(),
    );
    expect(order.paid).toBe("30000");
    expect(order.remaining).toBe("90000");
    await catalog.notification(staff.userId, key(), 0, 123456);
    const event = await prisma.outboxEvent.findUniqueOrThrow({
      where: { deduplicationKey: `door-quote-approved:${order.quote.id}` },
    });
    await new OutboxConsumerService(prisma).consume(event.id);
    const send = vi.fn(async () => ({
      status: "accepted" as const,
      providerMessageId: "TEST-ONLY-SMS",
    }));
    const templates = new SmsTemplateSettingsService(
      prisma,
      new ConfigService({ NODE_ENV: "test", SMS_PROVIDER_MODE: "disabled" }),
    );
    const delivery = new CustomerSmsDeliveryService(
      prisma,
      { send },
      new ConfigService(),
      templates,
    );
    const delivered = await delivery.dispatchBatch();
    expect(delivered.accepted).toBeGreaterThanOrEqual(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "door_quote_approved",
        templateId: 123456,
      }),
    );

    expect(order.customerAcceptedQuoteVersion).toBeNull();
    await expect(
      initiation.initiate({
        userId: actor.userId,
        orderId: order.id,
        idempotencyKey: key(),
        requestId: key(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    order = await service.accept(
      commandActor(actor),
      order.id,
      order.version,
      key(),
    );
    order = await pay(order);
    expect(order.paid).toBe("120000");
  });
  it("charges the full final amount once, serializes initiations and verifies repeated callbacks once", async () => {
    let order = await create(true);
    const args = { userId: actor.userId, orderId: order.id, requestId: key() };
    const attempts = await Promise.allSettled([
      initiation.initiate({ ...args, idempotencyKey: key() }),
      initiation.initiate({ ...args, idempotencyKey: key() }),
    ]);
    const rows = await prisma.payment.findMany({
      where: { orderId: order.id },
    });
    expect(rows).toHaveLength(1);
    const accepted = attempts.find((a) => a.status === "fulfilled");
    expect(accepted?.status).toBe("fulfilled");
    const authority = rows[0].authority!;
    expect(authority).toBeTruthy();
    expect(rows[0].amount.toString()).toBe("19001");
    expect((await prisma.doorPaymentAllocation.findUniqueOrThrow({ where: { paymentId: rows[0].id } })).purpose).toBe("SETTLEMENT");
    await Promise.all([
      verification.verify({ authority, status: "OK", requestId: key() }),
      verification.verify({ authority, status: "OK", requestId: key() }),
    ]);
    order = await service.detail(actor, order.id);
    expect(order.paid).toBe("19001");
    expect(order.status).toBe("DEPOSIT_PAID");
    expect(
      await prisma.paymentTransition.count({
        where: { paymentId: rows[0].id, to: "PAID" },
      }),
    ).toBe(1);
    expect(
      await prisma.fulfillment.count({ where: { orderId: order.id } }),
    ).toBe(0);
    expect(order.paid).toBe("19001");
    expect(order.remaining).toBe("0");
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe("PAID");
    await expect(
      initiation.initiate({ ...args, idempotencyKey: key() }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("preserves a historical deposit, charges only the remaining total and blocks early production", async () => {
    let order = await create(true);
    const originalSnapshot: Record<string, unknown> = structuredClone(order.quote.snapshot);
    originalSnapshot.deposit = "5701";
    originalSnapshot.depositPolicy = { kind: "PERCENT", value: "3000", minimum: "0" };
    // Isolated TEST ONLY representation of an attempt opened before this release.
    await prisma.$transaction(async tx => {
    const historicalQuote = await tx.doorQuotation.create({
      data: {
        orderId: order.id, version: order.quote.version + 1, approved: true,
        total: 19001n, deposit: 5701n,
        snapshot: JSON.parse(JSON.stringify(originalSnapshot)),
      },
    });
    await tx.doorOrder.update({
      where: { id: order.id },
      data: { currentQuoteVersion: historicalQuote.version, customerAcceptedQuoteVersion: historicalQuote.version },
    });
    });
    order = await service.detail(actor, order.id);
    expect(order.quote.snapshot).not.toHaveProperty("deposit");
    expect(order.quote.snapshot).not.toHaveProperty("depositPolicy");
    order = await historicalDeposit(order, 5701n);
    expect(order.paid).toBe("5701");
    expect(order.remaining).toBe("13300");
    expect(order.status).toBe("AWAITING_DEPOSIT");
    await expect(service.technical(commandActor(staff), order.id, order.version, "TEST ONLY", key()))
      .rejects.toMatchObject({ status: 409 });
    order = await pay(order);
    expect(order.paid).toBe("19001");
    expect(order.remaining).toBe("0");
    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(payments.map(p => p.amount.toString()).sort()).toEqual(["13300", "5701"]);
    const historical = await prisma.doorQuotation.findUniqueOrThrow({ where: { id: order.quote.id } });
    expect(historical.deposit).toBe(5701n);
    expect(historical.snapshot).toEqual(originalSnapshot);
  });
  it("holds an unreconciled overpayment out of technical approval and production", async () => {
    let order = await create(true);
    // Two individually valid historical attempts that together exceed the quote.
    order = await historicalDeposit(order, 19001n);
    order = await historicalDeposit(order, 1n);
    expect(order.paid).toBe("19002");
    expect(order.financialStatus).toBe("CREDIT");
    await expect(service.technical(commandActor(staff), order.id, order.version, "TEST ONLY", key()))
      .rejects.toMatchObject({ status: 409 });
    await expect(service.transition(commandActor(staff), order.id, { expectedVersion: order.version, status: "AWAITING_TECHNICAL_APPROVAL", reason: "TEST ONLY" }, key()))
      .rejects.toMatchObject({ status: 409 });
  });
  it("never fabricates disabled, failed, forged or uncertain provider outcomes", async () => {
    const order = await create(true);
    await expect(
      verification.verify({
        authority: "forged-test-authority",
        status: "OK",
        requestId: key(),
      }),
    ).rejects.toMatchObject({ status: 404 });
    vi.mocked(provider.authorize).mockResolvedValueOnce({ status: "disabled" });
    await expect(
      initiation.initiate({
        userId: actor.userId,
        orderId: order.id,
        idempotencyKey: key(),
        requestId: key(),
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect((await service.detail(actor, order.id)).paid).toBe("0");
    const attempt = await initiation.initiate({
      userId: actor.userId,
      orderId: order.id,
      idempotencyKey: key(),
      requestId: key(),
    });
    const authority = attempt.data.payment.authority;
    const nok = await verification.verify({
      authority,
      status: "NOK",
      requestId: key(),
    });
    expect(nok.data.verification.status).toBe("PENDING");
    vi.mocked(provider.verify).mockResolvedValueOnce({
      status: "unknown_result",
    });
    expect(
      (await verification.verify({ authority, status: "OK", requestId: key() }))
        .data.verification.status,
    ).toBe("PENDING");
    vi.mocked(provider.verify).mockResolvedValueOnce({
      status: "failed",
      reason: "amount",
    });
    expect(
      (await verification.verify({ authority, status: "OK", requestId: key() }))
        .data.verification.status,
    ).toBe("FAILED");
    expect((await service.detail(actor, order.id)).paid).toBe("0");
  });
  it("requires verified refund evidence before cancellation and preserves financial history", async () => {
    let order = await pay(await create(true));
    await expect(
      service.transition(
        commandActor(actor),
        order.id,
        {
          expectedVersion: order.version,
          status: "CANCELLED",
          reason: "TEST ONLY",
        },
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const payment = order.payments.find((p) => p.status === "PAID")!;
    const input = {
      paymentId: payment.id,
      actorId: staff.userId,
      requestId: key(),
      idempotencyKey: key(),
      amountMinorUnits: payment.amount,
      gatewayReferenceId: `TEST-REFUND-${randomUUID()}`,
      reason: "TEST ONLY refund evidence",
    };
    await refunds.record(input);
    await refunds.record(input);
    order = await service.detail(actor, order.id);
    expect(order.paid).toBe("0");
    expect(order.payments).toHaveLength(1);
    order = await service.transition(
      commandActor(actor),
      order.id,
      {
        expectedVersion: order.version,
        status: "CANCELLED",
        reason: "TEST ONLY refunded cancellation",
      },
      key(),
    );
    expect(order.status).toBe("CANCELLED");
    expect(order.remaining).toBe("0");
    expect(order.financialStatus).toBe("SETTLED");
  });
  it("reserves actual pieces, blocks duplicates and generic release, consumes once and enforces production states", async () => {
    let order = await pay(await create(true));
    await expect(
      service.transition(
        commandActor(staff),
        order.id,
        {
          expectedVersion: order.version,
          status: "IN_PRODUCTION",
          reason: "TEST ONLY",
        },
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    order = await service.technical(
      commandActor(staff),
      order.id,
      order.version,
      "TEST ONLY technical signoff",
      key(),
    );
    order = await service.transition(
      commandActor(staff),
      order.id,
      {
        expectedVersion: order.version,
        status: "APPROVED_FOR_PRODUCTION",
        reason: "TEST ONLY",
      },
      key(),
    );
    await expect(
      service.transition(
        commandActor(staff),
        order.id,
        {
          expectedVersion: order.version,
          status: "IN_PRODUCTION",
          reason: "TEST ONLY",
        },
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const requirement = order.requirements.find((r) => r.variantId)!;
    const reserveInput = {
      expectedVersion: order.version,
      warehouseId,
      locationId,
      actualStockQuantity: 2,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      reason: "TEST ONLY actual cut plan",
    };
    const idem = key();
    order = await service.reserve(
      commandActor(staff),
      order.id,
      requirement.id,
      reserveInput,
      idem,
    );
    order = await service.reserve(
      commandActor(staff),
      order.id,
      requirement.id,
      reserveInput,
      idem,
    );
    const r = order.requirements.find((r) => r.id === requirement.id)!;
    await expect(
      inventory.releaseReservation(r.reservationId!, {
        actorId: staff.userId,
        requestId: key(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.reserve(
        commandActor(staff),
        order.id,
        r.id,
        { ...reserveInput, expectedVersion: order.version },
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    order = await service.transition(
      commandActor(staff),
      order.id,
      {
        expectedVersion: order.version,
        status: "IN_PRODUCTION",
        reason: "TEST ONLY",
      },
      key(),
    );
    const consumeKey = key(),
      version = order.version;
    order = await service.materialAction(
      commandActor(staff),
      order.id,
      r.id,
      "consume",
      version,
      "TEST ONLY consumption",
      consumeKey,
    );
    await service.materialAction(
      commandActor(staff),
      order.id,
      r.id,
      "consume",
      version,
      "TEST ONLY consumption",
      consumeKey,
    );
    expect(
      await prisma.inventoryMovement.count({
        where: { referenceId: r.reservationId!, type: "SALE" },
      }),
    ).toBe(1);
    order = await service.transition(
      commandActor(staff),
      order.id,
      {
        expectedVersion: order.version,
        status: "QUALITY_CONTROL",
        reason: "TEST ONLY",
      },
      key(),
    );
    order = await service.transition(
      commandActor(staff),
      order.id,
      {
        expectedVersion: order.version,
        status: "READY_FOR_DELIVERY",
        reason: "TEST ONLY",
      },
      key(),
    );
    await expect(
      service.transition(
        commandActor(staff),
        order.id,
        {
          expectedVersion: order.version,
          status: "AWAITING_SETTLEMENT",
          reason: "TEST ONLY",
        },
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.transition(
        commandActor(staff),
        order.id,
        {
          expectedVersion: order.version,
          status: "COMPLETED",
          reason: "TEST ONLY",
        },
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    order = await service.transition(
      commandActor(staff),
      order.id,
      {
        expectedVersion: order.version,
        status: "COMPLETED",
        reason: "TEST ONLY",
        delivery: {
          recipient: "TEST ONLY",
          address: "TEST ONLY delivery",
          tracking: "",
        },
      },
      key(),
    );
    expect(order.status).toBe("COMPLETED");
    expect(order.remaining).toBe("0");
  });
  it("releases reservations and checks availability transactionally without consuming stock", async () => {
    let order = await pay(await create(true));
    order = await service.technical(
      commandActor(staff),
      order.id,
      order.version,
      "TEST ONLY",
      key(),
    );
    const r = order.requirements.find((r) => r.variantId)!;
    const input = {
      expectedVersion: order.version,
      warehouseId,
      locationId,
      actualStockQuantity: 200,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      reason: "TEST ONLY",
    };
    await expect(
      service.reserve(commandActor(staff), order.id, r.id, input, key()),
    ).rejects.toMatchObject({ status: 409 });
    order = await service.reserve(
      commandActor(staff),
      order.id,
      r.id,
      { ...input, actualStockQuantity: 2 },
      key(),
    );
    order = await service.materialAction(
      commandActor(staff),
      order.id,
      r.id,
      "release",
      order.version,
      "TEST ONLY release",
      key(),
    );
    expect(
      order.requirements.find((x) => x.id === r.id)?.reservationStatus,
    ).toBe("RELEASED");
    expect(
      (await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId } }))
        .onHand,
    ).toBe(98);
  });
  it("seals quotes/BOM against direct tampering, retains old rates and excludes generic order cancellation/expiry", async () => {
    const order = await create();
    await expect(
      prisma.doorQuotation.update({
        where: { id: order.quote.id },
        data: { total: 1n },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.doorMaterialRequirement.update({
        where: { id: order.requirements[0].id },
        data: { snapshot: { tampered: true } },
      }),
    ).rejects.toThrow();
    await expect(
      genericOrders.cancelAsCustomer(actor.userId, order.id, {
        idempotencyKey: key(),
        requestId: key(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await genericOrders.expireAbandonedOrderAsSystem(order.id, key()),
    ).toBe(false);
    const item = await prisma.doorOrderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await expect(prisma.doorOrderItem.update({ where: { id: item.id }, data: { widthMm: 999 } })).rejects.toThrow('Confirmed production specifications are immutable');
    expect((await service.detail(actor, order.id)).quote.snapshot.total).toBe(
      "19001",
    );
  });
  it("keeps a door sale a proforma until accepted and fully paid, then issues through the existing guards without a fake SKU", async () => {
    let order = await create();
    order = await service.prepareInvoiceSource(
      commandActor(staff),
      order.id,
      order.version,
      addressId,
      key(),
    );
    await policies.update(
      staff.userId,
      key(),
      {
        sellerName: "TEST ONLY",
        sellerAddress: "TEST ONLY",
        sellerContact: "example.test",
        taxTreatment: "INCLUSIVE",
        taxRateBps: 1000,
        exemptionReason: null,
        discountCapBps: 0,
        shippingTaxable: false,
        isActive: true,
        expectedVersion: (await policies.current())?.version ?? null,
        reason: "TEST ONLY approved policy",
      },
      key(),
    );
    const draft = await invoiceDrafts.fromOrder(
      staff.userId,
      key(),
      order.id,
      { expectedOrderVersion: order.commerceVersion, note: null },
      key(),
    );
    expect(draft.draft.doorQuoteId).toBe(order.quote.id);
    expect(draft.draft.lines[0].variantId).toBeNull();
    expect(draft.draft.sourceTermsMatch).toBe(true);
    expect(draft.draft.doorPayment).toEqual({
      status: "UNPAID",
      customerAccepted: false,
      finalInvoiceAllowed: false,
    });
    const issueRequest = {
      expectedVersion: draft.draft.version,
      expectedOrderVersion: order.commerceVersion,
    };
    await expect(
      documents.issue(staff.userId, key(), draft.draft.id, issueRequest, key()),
    ).rejects.toMatchObject({ response: { code: "INVOICE_PROFORMA_ONLY" } });
    order = await service.accept(
      commandActor(actor),
      order.id,
      order.version,
      key(),
    );
    await expect(
      documents.issue(staff.userId, key(), draft.draft.id, issueRequest, key()),
    ).rejects.toMatchObject({ response: { code: "INVOICE_PROFORMA_ONLY" } });
    order = await pay(order);
    const result = await documents.issue(
      staff.userId,
      key(),
      draft.draft.id,
      {
        expectedVersion: draft.draft.version,
        expectedOrderVersion: order.commerceVersion,
      },
      key(),
    );
    expect(result.document.quote.total.amount).toBe(order.quote.snapshot.total);
    expect(result.document.lines[0].orderItemId).toBeNull();
    expect(result.document.number).toMatch(/^IRY-/);
  });
  it("stores scanned private attachments once and prevents foreign customer access", async () => {
    const order = await create();
    const storage = {
      putObject: vi.fn(async () => {}),
      getObject: vi.fn(),
    } as unknown as ProductMediaStorage;
    const files = new DoorFilesService(prisma, service, storage, {
      scan: vi.fn(async () => "CLEAN" as const),
    });
    const file = {
      buffer: Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082",
        "hex",
      ),
      originalname: "TEST-ONLY.png",
    };
    const a = await files.upload(actor, order.id, file),
      b = await files.upload(actor, order.id, file);
    expect(a.id).toBe(b.id);
    await expect(files.download(other, order.id, a.id)).rejects.toMatchObject({
      status: 404,
    });
    const unavailable = new DoorFilesService(prisma, service, storage, {
      scan: vi.fn(async () => "UNAVAILABLE" as const),
    });
    await expect(
      unavailable.upload(actor, order.id, file),
    ).rejects.toMatchObject({ status: 503 });
  });
});
