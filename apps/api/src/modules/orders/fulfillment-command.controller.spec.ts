import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { REQUIRE_AUTH_LEVEL, REQUIRE_PERMISSION } from "../auth/auth.guard";
import { FulfillmentCommandController } from "./fulfillment-command.controller";

describe("FulfillmentCommandController", () => {
  it.each(["start", "ready"] as const)(
    "%s requires staff MFA and orders.manage",
    (method) => {
      expect(
        Reflect.getMetadata(
          REQUIRE_AUTH_LEVEL,
          FulfillmentCommandController.prototype[method],
        ),
      ).toBe("STAFF_MFA");
      expect(
        Reflect.getMetadata(
          REQUIRE_PERMISSION,
          FulfillmentCommandController.prototype[method],
        ),
      ).toBe("orders.manage");
    },
  );

  it("passes the server principal, command, request id and normalized key", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ data: { fulfillment: { status: "PROCESSING" } } });
    const controller = new FulfillmentCommandController({ execute } as never);
    await controller.start(
      { userId: "staff-1" } as never,
      "order-1",
      " key-1 ",
    );
    expect(execute).toHaveBeenCalledWith("order-1", "start", {
      actorId: "staff-1",
      requestId: expect.any(String),
      idempotencyKey: "key-1",
    });
    expect(() =>
      controller.ready({ userId: "staff-1" } as never, "order-1", undefined),
    ).toThrow(BadRequestException);
  });
});
