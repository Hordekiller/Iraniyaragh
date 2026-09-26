import { describe, expect, it, vi } from "vitest";
import { FulfillmentCommandService } from "./fulfillment-command.service";

function setup(
  status: "PAID" | "PENDING_PAYMENT" = "PAID",
  fulfillmentStatus = "PENDING",
) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    order: {
      findUnique: vi
        .fn()
        .mockResolvedValue({
          id: "order-1",
          status,
          fulfillment: { id: "fulfillment-1", status: fulfillmentStatus },
          payments: [{ id: "payment-1" }],
        }),
    },
    orderCommandIdempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    stockReservation: {
      count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
    },
    orderItem: { count: vi.fn().mockResolvedValue(1) },
    fulfillmentPick: { count: vi.fn().mockResolvedValue(1) },
    fulfillmentTransition: {
      create: vi.fn().mockResolvedValue({ id: "transition-1" }),
    },
    fulfillment: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({
          id: "fulfillment-1",
          updatedAt: new Date("2026-09-26T00:00:00.000Z"),
        }),
    },
  };
  const prisma = {
    $transaction: vi.fn((callback: (tx: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new FulfillmentCommandService(
    prisma as never,
    audit as never,
  );
  const context = {
    actorId: "staff-1",
    requestId: "req-1",
    idempotencyKey: "key-1",
  };
  return { tx, audit, service, context };
}

describe("FulfillmentCommandService", () => {
  it("starts processing with one transition, audit and durable replay result", async () => {
    const { tx, audit, service, context } = setup();
    const result = await service.execute("order-1", "start", context);
    expect(result.data.fulfillment).toMatchObject({
      status: "PROCESSING",
      orderId: "order-1",
    });
    expect(tx.fulfillmentTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        from: "PENDING",
        to: "PROCESSING",
        actorId: "staff-1",
      }),
    });
    expect(tx.fulfillment.updateMany).toHaveBeenCalledWith({
      where: { id: "fulfillment-1", status: "PENDING" },
      data: { status: "PROCESSING" },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "fulfillment.start",
        actorId: "staff-1",
      }),
      tx,
    );
    expect(tx.orderCommandIdempotencyRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: "fulfillment.start:staff",
        responseJson: result,
      }),
    });
  });

  it("returns an existing response without another transition", async () => {
    const { tx, service, context } = setup();
    const response = {
      data: { fulfillment: { id: "fulfillment-1", status: "PROCESSING" } },
    };
    // The stored fingerprint belongs to the actor and command, not the request id.
    const { createHash } = await import("node:crypto");
    tx.orderCommandIdempotencyRecord.findUnique.mockResolvedValue({
      fingerprint: createHash("sha256")
        .update(JSON.stringify({ actorId: context.actorId, command: "start" }))
        .digest("hex"),
      responseJson: response,
    });
    await expect(service.execute("order-1", "start", context)).resolves.toEqual(
      response,
    );
    expect(tx.fulfillmentTransition.create).not.toHaveBeenCalled();
  });

  it("refuses unpaid and unconsumed orders before any mutation", async () => {
    const unpaid = setup("PENDING_PAYMENT");
    await expect(
      unpaid.service.execute("order-1", "start", unpaid.context),
    ).rejects.toMatchObject({
      response: { code: "FULFILLMENT_STATE_CONFLICT" },
    });
    expect(unpaid.tx.fulfillmentTransition.create).not.toHaveBeenCalled();

    const unconsumed = setup();
    unconsumed.tx.stockReservation.count
      .mockReset()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    await expect(
      unconsumed.service.execute("order-1", "start", unconsumed.context),
    ).rejects.toMatchObject({
      response: { code: "FULFILLMENT_STATE_CONFLICT" },
    });
    expect(unconsumed.tx.fulfillmentTransition.create).not.toHaveBeenCalled();

    const fullyRefunded = setup();
    fullyRefunded.tx.order.findUnique.mockResolvedValue({
      id: "order-1",
      status: "PAID",
      fulfillment: { id: "fulfillment-1", status: "PENDING" },
      payments: [],
    });
    await expect(
      fullyRefunded.service.execute("order-1", "start", fullyRefunded.context),
    ).rejects.toMatchObject({
      response: { code: "FULFILLMENT_STATE_CONFLICT" },
    });
  });

  it("marks processing fulfillment ready but rejects a skipped transition", async () => {
    const valid = setup("PAID", "PROCESSING");
    await expect(
      valid.service.execute("order-1", "ready", valid.context),
    ).resolves.toMatchObject({
      data: { fulfillment: { status: "READY_TO_SHIP" } },
    });
    expect(valid.tx.stockReservation.count).not.toHaveBeenCalled();
    expect(valid.tx.fulfillmentPick.count).toHaveBeenCalledWith({ where: { fulfillmentId: "fulfillment-1" } });
    const unpicked = setup("PAID", "PROCESSING");
    unpicked.tx.fulfillmentPick.count.mockResolvedValue(0);
    await expect(unpicked.service.execute("order-1", "ready", unpicked.context))
      .rejects.toMatchObject({ response: { code: "FULFILLMENT_STATE_CONFLICT" } });
    expect(unpicked.tx.fulfillmentTransition.create).not.toHaveBeenCalled();
    const skipped = setup();
    await expect(
      skipped.service.execute("order-1", "ready", skipped.context),
    ).rejects.toMatchObject({
      response: { code: "FULFILLMENT_STATE_CONFLICT" },
    });
  });
});
