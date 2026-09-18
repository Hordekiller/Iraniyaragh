import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  AdminOrderListQueryDto,
  CustomerOrderListQueryDto,
} from "./order-read.dto";

describe("order read query DTOs", () => {
  it("accepts bounded customer pagination and real lifecycle states", async () => {
    const input = plainToInstance(CustomerOrderListQueryDto, {
      page: "2",
      perPage: "50",
      status: "PENDING_PAYMENT",
      sortDir: "asc",
    });
    await expect(validate(input)).resolves.toEqual([]);
    expect(input).toMatchObject({
      page: 2,
      perPage: 50,
      status: "PENDING_PAYMENT",
      sortDir: "asc",
    });
  });

  it("rejects oversized pages and persistence-invalid state names", async () => {
    const input = plainToInstance(AdminOrderListQueryDto, {
      page: "1",
      perPage: "101",
      paymentStatus: "UNPAID",
      fulfillmentStatus: "UNFULFILLED",
    });
    const errors = await validate(input);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(["perPage", "paymentStatus", "fulfillmentStatus"]),
    );
  });
});
