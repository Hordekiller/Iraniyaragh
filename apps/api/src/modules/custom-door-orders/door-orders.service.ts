import { createHash, randomUUID } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  DoorItemInput,
  DoorOrderView,
  DoorQuoteSnapshot,
  DoorQuote,
} from "@iranyaragh/contracts";
import { PrismaService } from "../../database/prisma.service";
import { advisoryLockIdKey } from "../../common/advisory-lock";
import {
  isPrismaTransactionConflict,
  withSerializableRetry,
} from "../../common/serializable-retry";
import { recordTransition } from "../../common/state-machine";
import { AuditLogService } from "../audit/audit-log.service";
import { normalizeCheckoutAddress } from "../orders/checkout-address";
import { InventoryService } from "../inventory/inventory.service";
import {
  DoorCatalogService,
  asDoorJson,
  assertDoorVersion,
  doorConflict,
} from "./door-catalog.service";
import {
  checkedMoney,
  doorMoney,
  doorPaid,
  priceDoors,
  withoutLegacyDeposit,
} from "./door-pricing";
import { assertDoorTransition } from "./door-state";
import type {
  DoorOrderDto,
  DoorPageDto,
  DoorQuoteApprovalDto,
  DoorReserveDto,
  DoorTransitionDto,
} from "./door.dto";

const include = {
  order: {
    include: {
      customer: true,
      payments: {
        include: { doorAllocation: true },
        orderBy: { createdAt: "asc" as const },
      },
    },
  },
  items: { orderBy: { ordinal: "asc" as const } },
  quotes: { orderBy: { version: "desc" as const } },
  records: { orderBy: { createdAt: "asc" as const } },
  requirements: {
    include: { reservation: true },
    orderBy: { ordinal: "asc" as const },
  },
  attachments: true,
} satisfies Prisma.DoorOrderInclude;
type Row = Prisma.DoorOrderGetPayload<{ include: typeof include }>;
export type DoorActor = { userId: string; requestId: string; staff?: boolean };
const fingerprint = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");

export async function lockDoorOrder(tx: Prisma.TransactionClient, id: string) {
  const [hi, lo] = advisoryLockIdKey("order", id);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
}
export function currentDoorQuote(row: Row) {
  const quote = row.quotes.find((q) => q.version === row.currentQuoteVersion);
  if (!quote) throw new ConflictException("نسخه قیمت سفارش یافت نشد.");
  return quote;
}
/** door_quote_money requires an approved quote's legacy deposit column and
 * snapshot field to match. Payment is 100%, so both hold the total; neither is
 * read by the payment flow or served. */
function quoteColumns(snapshot: DoorQuoteSnapshot, approved: boolean) {
  const total = approved ? BigInt(snapshot.total!) : null;
  return {
    approved,
    total,
    deposit: total,
    snapshot: asDoorJson(
      approved ? { ...snapshot, deposit: snapshot.total } : snapshot,
    ),
  };
}
function publicSnapshot(stored: DoorQuoteSnapshot): DoorQuoteSnapshot {
  const snapshot = withoutLegacyDeposit(stored);
  return {
    ...snapshot,
    lines: snapshot.lines.map((line) => ({
      ...line,
      model: {
        ...line.model,
        configuration: withoutLegacyDeposit(line.model.configuration),
      },
    })),
  };
}
function quoteView(q: Row["quotes"][number]): DoorQuote {
  return {
    id: q.id,
    version: q.version,
    approved: q.approved,
    snapshot: publicSnapshot(q.snapshot as unknown as DoorQuoteSnapshot),
    createdAt: q.createdAt.toISOString(),
  };
}
function itemView(i: Row["items"][number]): DoorItemInput {
  return {
    modelId: i.modelId,
    widthMm: i.widthMm,
    heightMm: i.heightMm,
    quantity: i.quantity,
    selections: i.configuration as unknown as DoorItemInput["selections"],
    ...(i.manufacturing ? { manufacturing: i.manufacturing as unknown as NonNullable<DoorItemInput["manufacturing"]> } : {}),
    notes: i.notes,
  };
}
function project(row: Row): DoorOrderView {
  const q = currentDoorQuote(row),
    paid = doorPaid(row.order.payments);
  const total = row.status === "CANCELLED" ? 0n : q.total;
  const remaining = total === null ? null : total > paid ? total - paid : 0n;
  return {
    id: row.id,
    commerceVersion: row.order.version,
    number: row.order.number,
    customerId: row.order.customerId,
    customerLabel:
      [row.order.customer.firstName, row.order.customer.lastName]
        .filter(Boolean)
        .join(" ") || "مشتری ایرانی یراق",
    status: row.status,
    version: row.version,
    technicalApproved: row.technicalApproved,
    customerAcceptedQuoteVersion: row.customerAcceptedQuoteVersion,
    items: row.items.map(itemView),
    quote: quoteView(q),
    quotes: row.quotes.map(quoteView),
    paid: paid.toString(),
    remaining: remaining?.toString() ?? null,
    refundableCredit:
      total !== null && paid > total ? (paid - total).toString() : "0",
    financialStatus:
      total === null
        ? "UNPRICED"
        : paid > total
          ? "CREDIT"
          : paid === total
            ? "SETTLED"
            : paid > 0n
              ? "PARTIAL"
              : "UNPAID",
    payments: row.order.payments.map((p) => ({
      id: p.id,
      amount: p.amount.toString(),
      refunded: p.refundedAmount.toString(),
      status: p.status,
      referenceId: p.referenceId,
      quoteId: p.doorAllocation?.quoteId ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
    records: row.records.map((r) => ({
      id: r.id,
      action: r.action,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
    })),
    requirements: row.requirements
      .filter((r) => r.quoteId === q.id)
      .map((r) => ({
        id: r.id,
        quoteId: r.quoteId,
        materialId: r.materialId,
        variantId: r.variantId,
        snapshot:
          r.snapshot as unknown as DoorOrderView["requirements"][number]["snapshot"],
        actualStockQuantity: r.actualStockQuantity,
        reservationId: r.reservationId,
        reservationStatus: r.reservation?.status ?? null,
        consumedAt: r.consumedAt?.toISOString() ?? null,
      })),
    attachments: row.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mime: a.mime,
      bytes: a.bytes,
    })),
    delivery: row.delivery as unknown as DoorOrderView["delivery"],
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class DoorOrdersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoorCatalogService) private readonly catalog: DoorCatalogService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}

  async report() {
    return this.prisma.$transaction(
      async (tx) => {
        const totals = await tx.$queryRaw<
          {
            count: string;
            quotedTotal: string;
            paid: string;
            remaining: string;
          }[]
        >`
        WITH paid AS (SELECT p."orderId", SUM(p.amount-p."refundedAmount") amount FROM "Payment" p
          WHERE p.status IN ('PAID','PARTIALLY_REFUNDED','REFUNDED') GROUP BY p."orderId"),
        source AS (SELECT d.id,CASE WHEN d.status='CANCELLED' THEN 0::bigint ELSE q.total END total,COALESCE(p.amount,0) paid FROM "DoorOrder" d
          JOIN "DoorQuotation" q ON q."orderId"=d.id AND q.version=d."currentQuoteVersion" LEFT JOIN paid p ON p."orderId"=d.id)
        SELECT COUNT(*)::text count,COALESCE(SUM(total),0)::text "quotedTotal",COALESCE(SUM(paid),0)::text paid,
          COALESCE(SUM(GREATEST(total-paid,0)),0)::text remaining FROM source`;
        const statuses = await tx.doorOrder.groupBy({
          by: ["status"],
          _count: { _all: true },
        });
        return {
          ...totals[0],
          count: Number(totals[0].count),
          statuses: statuses.map((s) => ({
            status: s.status,
            count: s._count._all,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async preview(input: DoorOrderDto) {
    const catalog = await this.catalog.catalog();
    return priceDoors(input.items, catalog.models, catalog.materials);
  }
  async list(actor: DoorActor, page: DoorPageDto) {
    const where: Prisma.DoorOrderWhereInput = actor.staff
      ? {}
      : { order: { customer: { userId: actor.userId } } };
    const [rows, count] = await this.prisma.$transaction([
      this.prisma.doorOrder.findMany({
        where,
        include,
        take: page.limit,
        skip: page.offset,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.doorOrder.count({ where }),
    ]);
    return {
      items: rows.map(project),
      count,
      offset: page.offset,
      limit: page.limit,
    };
  }
  async detail(
    actor: DoorActor,
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<DoorOrderView> {
    return project(await this.owned(tx, actor, id));
  }
  async create(
    actor: DoorActor,
    input: DoorOrderDto,
    key: string,
    draft = false,
  ): Promise<DoorOrderView> {
    const id = await this.transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { userId: actor.userId },
        select: { id: true, status: true },
      });
      if (!customer || customer.status !== "ACTIVE")
        doorConflict("ابتدا پروفایل فعال مشتری را تکمیل کنید.");
      return this.command(
        tx,
        actor,
        draft ? "draft" : "create",
        key,
        input,
        async () => {
          const catalog = await this.catalog.catalog(false, tx);
          const snapshot = priceDoors(
            input.items,
            catalog.models,
            catalog.materials,
          );
          const approved = snapshot.total !== null;
          const id = randomUUID();
          const status = draft
            ? "DRAFT"
            : approved
              ? "AWAITING_DEPOSIT"
              : "PENDING_QUOTE_APPROVAL";
          // Commercial order remains DRAFT until a final quote exists. Reservation
          // expiry is inapplicable to production; ordinary checkout excludes it.
          await tx.order.create({
            data: {
              id,
              number: `D${randomUUID().replaceAll("-", "").slice(0, 18).toUpperCase()}`,
              customerId: customer.id,
              subtotal: BigInt(snapshot.total ?? "0"),
              grandTotal: BigInt(snapshot.total ?? "0"),
              addressSnapshot: {},
              shippingMethod: "custom-production",
              shippingMethodTitle: "تحویل سفارش ساخت",
              shippingPolicyRevision: "custom-door:v1",
              pricePolicyRevision: "custom-door:v1",
              reservationExpiresAt: new Date(),
              customDoorOrder: {
                create: {
                  status,
                  items: {
                    create: input.items.map((i, ordinal) => ({
                      ordinal,
                      modelId: i.modelId,
                      widthMm: i.widthMm,
                      heightMm: i.heightMm,
                      quantity: i.quantity,
                      configuration: asDoorJson(i.selections),
                      ...(i.manufacturing ? { manufacturing: asDoorJson(i.manufacturing) } : {}),
                      notes: i.notes,
                    })),
                  },
                  quotes: {
                    create: {
                      version: 1,
                      ...quoteColumns(snapshot, !draft && approved),
                    },
                  },
                },
              },
            },
          });
          if (!draft && approved) {
            await recordTransition(
              tx,
              "order",
              id,
              "DRAFT",
              "PENDING_PAYMENT",
              {
                actorId: actor.userId,
                requestId: actor.requestId,
                reason: "DOOR_QUOTE_APPROVED",
              },
            );
            const q = await tx.doorQuotation.findUniqueOrThrow({
              where: { orderId_version: { orderId: id, version: 1 } },
            });
            await this.bom(tx, id, q.id, snapshot);
          }
          await this.record(
            tx,
            actor,
            id,
            draft ? "DRAFT_SAVED" : "SUBMITTED",
            draft
              ? "پیش‌نویس ذخیره شد."
              : approved
                ? "سفارش با قیمت محاسبه‌شده ثبت شد؛ تأیید مشخصات مشتری لازم است."
                : "سفارش برای بررسی و تأیید قیمت ثبت شد.",
            { status, quoteVersion: 1 },
          );
          return id;
        },
      );
    });
    return this.detail(actor, id);
  }

  async replaceDraft(
    actor: DoorActor,
    id: string,
    input: DoorOrderDto,
    expectedVersion: number,
    key: string,
  ) {
    return this.mutate(
      actor,
      id,
      "edit-draft",
      key,
      { input, expectedVersion },
      async (tx, row) => {
        assertDoorVersion(expectedVersion, row.version);
        if (row.status !== "DRAFT")
          doorConflict("فقط پیش‌نویس قابل ویرایش است.");
        const catalog = await this.catalog.catalog(false, tx);
        const snapshot = priceDoors(
          input.items,
          catalog.models,
          catalog.materials,
        );
        await tx.doorOrderItem.deleteMany({ where: { orderId: id } });
        await tx.doorOrderItem.createMany({
          data: input.items.map((i, ordinal) => ({
            orderId: id,
            ordinal,
            modelId: i.modelId,
            widthMm: i.widthMm,
            heightMm: i.heightMm,
            quantity: i.quantity,
            configuration: asDoorJson(i.selections),
            ...(i.manufacturing ? { manufacturing: asDoorJson(i.manufacturing) } : {}),
            notes: i.notes,
          })),
        });
        const version = row.currentQuoteVersion + 1;
        await tx.doorQuotation.create({
          data: { orderId: id, version, snapshot: asDoorJson(snapshot) },
        });
        await tx.doorOrder.update({
          where: { id },
          data: { currentQuoteVersion: version, version: { increment: 1 } },
        });
        await this.record(
          tx,
          actor,
          id,
          "DRAFT_EDITED",
          "مشخصات پیش‌نویس ویرایش شد.",
          { quoteVersion: version },
        );
      },
    );
  }
  async submitDraft(
    actor: DoorActor,
    id: string,
    expectedVersion: number,
    key: string,
  ) {
    return this.mutate(
      actor,
      id,
      "submit-draft",
      key,
      { expectedVersion },
      async (tx, row) => {
        assertDoorVersion(expectedVersion, row.version);
        if (row.status !== "DRAFT") doorConflict("سفارش قبلاً ارسال شده است.");
        const catalog = await this.catalog.catalog(false, tx);
        const snapshot = priceDoors(
          row.items.map(itemView),
          catalog.models,
          catalog.materials,
        );
        const version = row.currentQuoteVersion + 1,
          approved = snapshot.total !== null;
        const q = await tx.doorQuotation.create({
          data: {
            orderId: id,
            version,
            ...quoteColumns(snapshot, approved),
          },
        });
        await tx.doorOrder.update({
          where: { id },
          data: {
            currentQuoteVersion: version,
            status: approved ? "AWAITING_DEPOSIT" : "PENDING_QUOTE_APPROVAL",
            version: { increment: 1 },
          },
        });
        if (approved) {
          await tx.order.update({
            where: { id },
            data: {
              subtotal: q.total!,
              grandTotal: q.total!,
              pricePolicyRevision: `custom-door:q${version}`,
            },
          });
          await recordTransition(tx, "order", id, "DRAFT", "PENDING_PAYMENT", {
            actorId: actor.userId,
            requestId: actor.requestId,
            reason: "DOOR_QUOTE_APPROVED",
          });
          await this.bom(tx, id, q.id, snapshot);
        }
        await this.record(
          tx,
          actor,
          id,
          "SUBMITTED",
          approved
            ? "سفارش با قیمت محاسبه‌شده ثبت شد."
            : "سفارش در انتظار تأیید قیمت است.",
          { quoteVersion: version },
        );
      },
    );
  }
  async approveQuote(
    actor: DoorActor,
    id: string,
    input: DoorQuoteApprovalDto,
    key: string,
  ) {
    return this.mutate(
      actor,
      id,
      "approve-quote",
      key,
      input,
      async (tx, row) => {
        assertDoorVersion(input.expectedVersion, row.version);
        if (
          ![
            "PENDING_QUOTE_APPROVAL",
            "AWAITING_DEPOSIT",
            "DEPOSIT_PAID",
            "AWAITING_TECHNICAL_APPROVAL",
          ].includes(row.status)
        )
          doorConflict("اصلاح قیمت در این مرحله مجاز نیست.");
        if (
          await tx.invoiceDraft.count({
            where: { sourceOrderId: id, state: { not: "CANCELLED" } },
          })
        )
          doorConflict(
            "پیش از اصلاح قیمت، پیش‌فاکتور مالی باز را لغو کنید. سند صادرشده قابل بازنویسی نیست.",
          );
        if (row.order.status === "PAID")
          doorConflict("اصلاح سفارش تسویه‌شده نیازمند سند مالی اصلاحی است.");
        if (row.order.payments.some((p) => p.status === "PENDING"))
          doorConflict("ابتدا پرداخت باز را با درگاه تطبیق دهید.");
        if (
          row.requirements.some(
            (r) =>
              r.reservation?.status === "ACTIVE" ||
              r.reservation?.status === "CONSUMED",
          )
        )
          doorConflict("پیش از اصلاح قیمت، رزرو قطعات باید آزاد شود.");
        const previous = currentDoorQuote(row);
        const total = doorMoney(input.total),
          paid = doorPaid(row.order.payments);
        if (total <= 0n || total < paid)
          doorConflict(
            "قیمت باید مثبت و حداقل برابر پرداخت خالص باشد؛ ابتدا استرداد ثبت و تطبیق شود.",
          );
        // Both base replacement and every extra have explicit, immutable reasons.
        const extras = input.adjustments.reduce(
          (n, a) => checkedMoney(n + doorMoney(a.amount)),
          0n,
        );
        if (extras > total)
          doorConflict("هزینه‌های جانبی از جمع قطعی بیشتر است.");
        const originalSnapshot = withoutLegacyDeposit(
          previous.snapshot as unknown as DoorQuoteSnapshot,
        );
        if (
          input.lineTotals.length !== originalSnapshot.lines.length ||
          input.lineTotals.reduce(
            (sum, line) => checkedMoney(sum + doorMoney(line.total)),
            extras,
          ) !== total
        )
          doorConflict(
            "جمع قیمت‌های قطعی ردیف‌ها و هزینه‌های جانبی باید دقیقاً برابر مبلغ نهایی باشد.",
          );
        const version = row.currentQuoteVersion + 1;
        const snapshot: DoorQuoteSnapshot = {
          ...originalSnapshot,
          lines: originalSnapshot.lines.map((line, index) => {
            const final = doorMoney(input.lineTotals[index].total);
            return {
              ...line,
              total: final.toString(),
              unitTotal:
                final % BigInt(line.quantity) === 0n
                  ? (final / BigInt(line.quantity)).toString()
                  : null,
            };
          }),
          total: total.toString(),
          adjustments: input.adjustments,
          approvalReason:
            input.reason +
            "\n" +
            input.lineTotals
              .map((line, index) => `ردیف ${index + 1}: ${line.reason}`)
              .join("\n"),
        };
        const quote = await tx.doorQuotation.create({
          data: {
            orderId: id,
            version,
            ...quoteColumns(snapshot, true),
            approvedById: actor.userId,
          },
        });
        await tx.doorOrder.update({
          where: { id },
          data: {
            status: "AWAITING_DEPOSIT",
            currentQuoteVersion: version,
            technicalApproved: false,
            customerAcceptedQuoteVersion: null,
            version: { increment: 1 },
          },
        });
        await tx.order.update({
          where: { id },
          data: {
            subtotal: total,
            grandTotal: total,
            pricePolicyRevision: `custom-door:q${version}`,
            version: { increment: 1 },
          },
        });
        if (row.order.status === "DRAFT")
          await recordTransition(tx, "order", id, "DRAFT", "PENDING_PAYMENT", {
            actorId: actor.userId,
            requestId: actor.requestId,
            reason: "DOOR_QUOTE_APPROVED",
          });
        await this.bom(tx, id, quote.id, snapshot);
        await this.record(tx, actor, id, "QUOTE_APPROVED", input.reason, {
          quoteVersion: version,
          total: total.toString(),
        });
        await tx.outboxEvent.create({
          data: {
            topic: "DOOR_QUOTE_APPROVED",
            aggregateType: "order",
            aggregateId: id,
            deduplicationKey: `door-quote-approved:${quote.id}`,
            payload: { orderId: id, quoteId: quote.id, quoteVersion: version },
          },
        });
      },
    );
  }
  async accept(
    actor: DoorActor,
    id: string,
    expectedVersion: number,
    key: string,
  ) {
    return this.mutate(
      actor,
      id,
      "customer-accept",
      key,
      { expectedVersion },
      async (tx, row) => {
        assertDoorVersion(expectedVersion, row.version);
        const q = currentDoorQuote(row);
        if (
          !q.approved ||
          ![
            "AWAITING_DEPOSIT",
            "DEPOSIT_PAID",
            "AWAITING_TECHNICAL_APPROVAL",
          ].includes(row.status)
        )
          doorConflict("قیمت قطعی برای پذیرش آماده نیست.");
        const funded = doorPaid(row.order.payments) === q.total!;
        await tx.doorOrder.update({
          where: { id },
          data: {
            customerAcceptedQuoteVersion: q.version,
            status: funded ? "DEPOSIT_PAID" : "AWAITING_DEPOSIT",
            version: { increment: 1 },
          },
        });
        await this.record(
          tx,
          actor,
          id,
          "CUSTOMER_ACCEPTED",
          "مشتری مشخصات و نسخه قطعی قیمت را تأیید کرد.",
          { quoteVersion: q.version },
        );
      },
    );
  }
  async technical(
    actor: DoorActor,
    id: string,
    expectedVersion: number,
    reason: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      id,
      "technical-approval",
      key,
      { expectedVersion, reason },
      async (tx, row) => {
        assertDoorVersion(expectedVersion, row.version);
        if (
          !["DEPOSIT_PAID", "AWAITING_TECHNICAL_APPROVAL"].includes(row.status)
        )
          doorConflict(
            "تأیید فنی پس از پرداخت کامل و پذیرش مشخصات انجام می‌شود.",
          );
        const q = currentDoorQuote(row);
        if (
          !q.approved ||
          row.customerAcceptedQuoteVersion !== q.version ||
          doorPaid(row.order.payments) !== q.total!
        )
          doorConflict("پرداخت کامل یا پذیرش نسخه جاری کامل نیست.");
        await tx.doorOrder.update({
          where: { id },
          data: {
            technicalApproved: true,
            status: "AWAITING_TECHNICAL_APPROVAL",
            version: { increment: 1 },
          },
        });
        await this.record(tx, actor, id, "TECHNICAL_APPROVED", reason, {
          quoteVersion: q.version,
        });
      },
    );
  }
  async transition(
    actor: DoorActor,
    id: string,
    input: DoorTransitionDto,
    key: string,
  ) {
    return this.mutate(actor, id, "transition", key, input, async (tx, row) => {
      assertDoorVersion(input.expectedVersion, row.version);
      if (!actor.staff && input.status !== "CANCELLED")
        doorConflict("عملیات تولید فقط در اختیار مدیر است.");
      const q = currentDoorQuote(row),
        paid = doorPaid(row.order.payments);
      const requirements = row.requirements.filter(
        (r) => r.quoteId === q.id && r.variantId,
      );
      const delivery = input.delivery ?? row.delivery;
      assertDoorTransition(row.status, input.status, {
        approved: q.approved,
        accepted: row.customerAcceptedQuoteVersion === q.version,
        remaining: q.total === null ? 1n : q.total - paid,
        technical: row.technicalApproved,
        stockReady: requirements.every(
          (r) =>
            r.consumedAt ||
            (r.reservation?.status === "ACTIVE" &&
              r.reservation.expiresAt > new Date()),
        ),
        consumed: requirements.every((r) => r.consumedAt),
        delivery: !!delivery,
      });
      if (input.status === "CANCELLED") {
        if (row.order.payments.some((p) => p.status === "PENDING") || paid > 0n)
          doorConflict(
            "لغو نیازمند تطبیق پرداخت‌های باز و استرداد کامل از مسیر پرداخت موجود است.",
          );
        for (const r of row.requirements.filter(
          (r) => r.reservation?.status === "ACTIVE",
        ))
          await this.inventory.transitionProductionReservationIn(
            tx,
            r.reservationId!,
            "release",
            { actorId: actor.userId, requestId: actor.requestId },
          );
        if (row.order.status !== "PAID")
          await recordTransition(
            tx,
            "order",
            id,
            row.order.status,
            "CANCELLED",
            {
              actorId: actor.userId,
              requestId: actor.requestId,
              reason: "DOOR_CANCELLED",
            },
          );
      }
      await tx.doorOrder.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.delivery ? { delivery: asDoorJson(input.delivery) } : {}),
          version: { increment: 1 },
        },
      });
      await this.record(tx, actor, id, "STATUS_CHANGED", input.reason, {
        from: row.status,
        to: input.status,
      });
    });
  }
  async invoiceAddresses(actor: DoorActor, id: string) {
    const row = await this.owned(this.prisma, actor, id);
    return this.prisma.customerAddress.findMany({
      where: { customerId: row.order.customerId },
      select: {
        id: true,
        label: true,
        city: true,
        addressLine: true,
        postalCode: true,
        receiverName: true,
      },
    });
  }
  async prepareInvoiceSource(
    actor: DoorActor,
    id: string,
    expectedVersion: number,
    addressId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      id,
      "invoice-source",
      key,
      { expectedVersion, addressId },
      async (tx, row) => {
        assertDoorVersion(expectedVersion, row.version);
        const q = currentDoorQuote(row);
        if (
          !q.approved ||
          ["CANCELLED", "DRAFT"].includes(row.status)
        )
          doorConflict("نسخه قطعی قیمت برای پیش‌فاکتور لازم است.");
        if (
          await tx.invoiceDraft.count({
            where: { sourceOrderId: id, state: { not: "CANCELLED" } },
          })
        )
          doorConflict("این سفارش پیش‌فاکتور مالی باز یا سند صادرشده دارد.");
        const address = await tx.customerAddress.findFirst({
          where: { id: addressId, customerId: row.order.customerId },
        });
        if (!address)
          doorConflict("نشانی معتبر متعلق به همین مشتری انتخاب کنید.");
        const snapshot = normalizeCheckoutAddress({
          provinceCode: address.provinceCode,
          city: address.city,
          address: address.addressLine,
          postalCode: address.postalCode ?? "",
          recipient: address.receiverName,
          mobile: address.mobile,
        });
        await tx.order.update({
          where: { id },
          data: {
            addressSnapshot: asDoorJson(snapshot),
            version: { increment: 1 },
          },
        });
        await tx.doorOrder.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
        await this.record(
          tx,
          actor,
          id,
          "INVOICE_SOURCE_PREPARED",
          "نشانی صورتحساب و نسخه قیمت برای فاکتور فروشگاه تثبیت شد.",
          { quoteId: q.id },
        );
      },
    );
  }
  async message(actor: DoorActor, id: string, message: string, key: string) {
    return this.mutate(
      actor,
      id,
      "message",
      key,
      { message },
      async (tx, row) => {
        if (["CANCELLED", "COMPLETED"].includes(row.status))
          doorConflict("سفارش بسته شده است.");
        await this.record(
          tx,
          actor,
          id,
          actor.staff ? "STAFF_MESSAGE" : "CUSTOMER_MESSAGE",
          message,
          {},
        );
      },
    );
  }
  async reserve(
    actor: DoorActor,
    id: string,
    requirementId: string,
    input: DoorReserveDto,
    key: string,
  ) {
    return this.mutate(
      actor,
      id,
      "reserve",
      key,
      { requirementId, input },
      async (tx, row) => {
        assertDoorVersion(input.expectedVersion, row.version);
        if (
          !row.technicalApproved ||
          ![
            "AWAITING_TECHNICAL_APPROVAL",
            "APPROVED_FOR_PRODUCTION",
            "IN_PRODUCTION",
          ].includes(row.status)
        )
          doorConflict("رزرو به تأیید فنی و مرحله مجاز نیاز دارد.");
        const q = currentDoorQuote(row);
        const requirement = row.requirements.find(
          (r) => r.id === requirementId && r.quoteId === q.id,
        );
        if (
          !requirement?.variantId ||
          requirement.consumedAt ||
          requirement.reservation?.status === "ACTIVE"
        )
          doorConflict("نیازمندی قابل رزرو نیست یا قبلاً رزرو شده است.");
        if (new Date(input.expiresAt) <= new Date())
          doorConflict("انقضای رزرو باید در آینده باشد.");
        const reservation = await this.inventory.reserveIn(tx, {
          actorId: actor.userId,
          requestId: actor.requestId,
          warehouseId: input.warehouseId,
          locationId: input.locationId,
          variantId: requirement.variantId,
          quantity: input.actualStockQuantity,
          expiresAt: new Date(input.expiresAt),
          idempotencyKey: `door:${requirementId}:${row.version}`,
        });
        await tx.doorMaterialRequirement.update({
          where: { id: requirementId },
          data: {
            reservationId: reservation.id,
            actualStockQuantity: input.actualStockQuantity,
          },
        });
        await tx.doorOrder.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
        await this.record(tx, actor, id, "MATERIAL_RESERVED", input.reason, {
          requirementId,
          reservationId: reservation.id,
          actualStockQuantity: input.actualStockQuantity,
        });
      },
    );
  }
  async materialAction(
    actor: DoorActor,
    id: string,
    requirementId: string,
    action: "consume" | "release",
    expectedVersion: number,
    reason: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      id,
      `material-${action}`,
      key,
      { requirementId, expectedVersion, reason },
      async (tx, row) => {
        assertDoorVersion(expectedVersion, row.version);
        const r = row.requirements.find(
          (r) =>
            r.id === requirementId && r.quoteId === currentDoorQuote(row).id,
        );
        if (
          !r?.reservationId ||
          r.consumedAt ||
          r.reservation?.status !== "ACTIVE"
        )
          doorConflict("رزرو فعال پیدا نشد.");
        if (action === "consume" && row.status !== "IN_PRODUCTION")
          doorConflict("مصرف فقط در مرحله تولید ثبت می‌شود.");
        if (["COMPLETED", "CANCELLED"].includes(row.status))
          doorConflict("سفارش بسته شده است.");
        await this.inventory.transitionProductionReservationIn(
          tx,
          r.reservationId,
          action,
          { actorId: actor.userId, requestId: actor.requestId },
        );
        await tx.doorMaterialRequirement.update({
          where: { id: r.id },
          data: action === "consume" ? { consumedAt: new Date() } : {},
        });
        await tx.doorOrder.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
        await this.record(
          tx,
          actor,
          id,
          action === "consume" ? "MATERIAL_CONSUMED" : "MATERIAL_RELEASED",
          reason,
          { requirementId, actualStockQuantity: r.actualStockQuantity },
        );
      },
    );
  }
  async owned(
    tx: Prisma.TransactionClient,
    actor: DoorActor,
    id: string,
  ): Promise<Row> {
    const row = await tx.doorOrder.findFirst({
      where: {
        id,
        ...(actor.staff
          ? {}
          : { order: { customer: { userId: actor.userId } } }),
      },
      include,
    });
    if (!row)
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "سفارش ساخت درب یافت نشد.",
      });
    return row;
  }
  private async bom(
    tx: Prisma.TransactionClient,
    id: string,
    quoteId: string,
    snapshot: DoorQuoteSnapshot,
  ) {
    const parts = snapshot.lines.flatMap((l) => l.parts);
    if (parts.length)
      await tx.doorMaterialRequirement.createMany({
        data: parts.map((p, ordinal) => ({
          orderId: id,
          quoteId,
          ordinal,
          materialId: p.materialId,
          variantId: p.variantId,
          snapshot: asDoorJson(p),
        })),
      });
  }
  private async record(
    tx: Prisma.TransactionClient,
    actor: DoorActor,
    id: string,
    action: string,
    message: string,
    payload: Prisma.InputJsonObject,
  ) {
    await tx.doorProductionRecord.create({
      data: { orderId: id, actorId: actor.userId, action, message, payload },
    });
    await this.audit.record(
      {
        actorId: actor.userId,
        requestId: actor.requestId,
        action: `custom-door.${action.toLowerCase()}`,
        entityType: "door-order",
        entityId: id,
        metadata: payload,
      },
      tx,
    );
  }
  private async mutate(
    actor: DoorActor,
    id: string,
    scope: string,
    key: string,
    input: unknown,
    apply: (tx: Prisma.TransactionClient, row: Row) => Promise<void>,
  ) {
    await this.transaction(async (tx) => {
      await lockDoorOrder(tx, id);
      const row = await this.owned(tx, actor, id);
      if (!actor.staff && row.order.customer.status !== "ACTIVE")
        doorConflict("پروفایل مشتری برای این عملیات فعال نیست.");
      await this.command(tx, actor, `${scope}:${id}`, key, input, async () => {
        await apply(tx, row);
        return id;
      });
    });
    return this.detail(actor, id);
  }
  private async command(
    tx: Prisma.TransactionClient,
    actor: DoorActor,
    scope: string,
    key: string,
    payload: unknown,
    apply: () => Promise<string>,
  ) {
    const hash = fingerprint({ actor: actor.userId, scope, key }),
      fp = fingerprint(payload);
    const [hi, lo] = advisoryLockIdKey("door-command", hash);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
    const previous = await tx.doorCommand.findUnique({ where: { key: hash } });
    if (previous) {
      if (previous.fingerprint !== fp)
        doorConflict("کلید تکرار با درخواست متفاوت استفاده شده است.");
      return previous.resultId;
    }
    const resultId = await apply();
    await tx.doorCommand.create({
      data: { key: hash, fingerprint: fp, resultId },
    });
    return resultId;
  }
  private transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return withSerializableRetry({
      isContention: isPrismaTransactionConflict,
      conflictMessage:
        "سفارش هم‌زمان تغییر کرد؛ با همان کلید دوباره تلاش کنید.",
      operation: () =>
        this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 15000,
        }),
    });
  }
}
