import "reflect-metadata";

import { Module, ValidationPipe, VersioningType } from "@nestjs/common";
import { NestFactory, type INestApplication } from "@nestjs/core";
import { APP_GUARD } from "@nestjs/core";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ApiFoundationModule } from "../../common/api-foundation.module";
import { AuditLogService } from "../audit/audit-log.service";
import { AuthSessionException } from "../auth/auth-session.service";
import { AuthGuard } from "../auth/auth.guard";
import {
  AuthPrincipalService,
  type AuthPrincipalContext,
} from "../auth/auth-principal.service";
import { OrderReadController } from "./order-read.controller";
import { OrderReadService } from "./order-read.service";

const basePrincipal = {
  sessionId: "session-orders-http",
  tokenId: "token-orders-http",
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
};

const customerPrincipal: AuthPrincipalContext = Object.freeze({
  ...basePrincipal,
  userId: "customer-user-http",
  authenticationLevel: "CUSTOMER_OTP",
  permissions: new Set<string>(),
});

const staffPrincipal: AuthPrincipalContext = Object.freeze({
  ...basePrincipal,
  userId: "staff-user-http",
  authenticationLevel: "STAFF_MFA",
  permissions: new Set(["orders.read"]),
});

const staffWithoutPermission: AuthPrincipalContext = Object.freeze({
  ...staffPrincipal,
  userId: "staff-without-orders-read",
  permissions: new Set(["catalog.read"]),
});

const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string) => {
    if (authorization === "Bearer customer") return customerPrincipal;
    if (authorization === "Bearer staff") return staffPrincipal;
    if (authorization === "Bearer staff-without-permission") {
      return staffWithoutPermission;
    }
    throw new AuthSessionException("AUTH_SESSION_INVALID");
  }),
};

const orderService = {
  listCustomerOrders: vi.fn(async () => ({
    data: { items: [], meta: { page: 1, perPage: 25, total: 0, pages: 0 } },
  })),
  getCustomerOrder: vi.fn(async (_userId: string, id: string) => ({
    data: { order: { id } },
  })),
  listAdminOrders: vi.fn(async () => ({
    data: { items: [], meta: { page: 1, perPage: 25, total: 0, pages: 0 } },
  })),
  getAdminOrder: vi.fn(async (id: string) => ({ data: { order: { id } } })),
};

@Module({
  imports: [ApiFoundationModule],
  controllers: [OrderReadController],
  providers: [
    { provide: OrderReadService, useValue: orderService },
    { provide: AuthPrincipalService, useValue: principalService },
    {
      provide: APP_GUARD,
      useValue: new AuthGuard(
        principalService as unknown as AuthPrincipalService,
        { record: vi.fn(async () => undefined) } as unknown as AuditLogService,
      ),
    },
  ],
})
class OrderReadHttpTestModule {}

describe("OrderReadController HTTP authorization", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(OrderReadHttpTestModule, { logger: false });
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("binds the customer principal to ownership-scoped list and detail reads", async () => {
    const list = await request("/api/v1/orders?page=1&perPage=25", "customer");
    expect(list.status, await list.clone().text()).toBe(200);
    expect(orderService.listCustomerOrders).toHaveBeenCalledWith(
      customerPrincipal.userId,
      expect.objectContaining({ page: 1, perPage: 25 }),
    );

    const detail = await request("/api/v1/orders/order-owned", "customer");
    expect(detail.status).toBe(200);
    expect(orderService.getCustomerOrder).toHaveBeenCalledWith(
      customerPrincipal.userId,
      "order-owned",
    );
  });

  it("requires staff MFA plus orders.read for both admin reads", async () => {
    for (const path of [
      "/api/v1/orders/admin",
      "/api/v1/orders/admin/order-1",
    ]) {
      const missing = await fetch(baseUrl + path);
      expect(missing.status).toBe(401);
      await expect(missing.json()).resolves.toMatchObject({
        code: "AUTH_SESSION_INVALID",
        statusCode: 401,
      });

      const customer = await request(path, "customer");
      expect(customer.status).toBe(403);
      await expect(customer.json()).resolves.toMatchObject({
        code: "FORBIDDEN",
        statusCode: 403,
      });

      const unprivileged = await request(path, "staff-without-permission");
      expect(unprivileged.status).toBe(403);
      await expect(unprivileged.json()).resolves.toMatchObject({
        code: "FORBIDDEN",
        statusCode: 403,
      });
    }

    const list = await request(
      "/api/v1/orders/admin?status=PENDING_PAYMENT",
      "staff",
    );
    expect(list.status, await list.clone().text()).toBe(200);
    expect(orderService.listAdminOrders).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING_PAYMENT" }),
    );

    const detail = await request("/api/v1/orders/admin/order-1", "staff");
    expect(detail.status).toBe(200);
    expect(orderService.getAdminOrder).toHaveBeenCalledWith("order-1");
  });

  it("does not let a staff token enter customer-owned routes", async () => {
    const response = await request("/api/v1/orders/order-1", "staff");
    expect(response.status).toBe(403);
    expect(orderService.getCustomerOrder).not.toHaveBeenCalled();
  });

  it("rejects unbounded and unknown query input before the service", async () => {
    const oversized = await request(
      "/api/v1/orders/admin?perPage=101",
      "staff",
    );
    expect(oversized.status, await oversized.clone().text()).toBe(400);
    const unknown = await request("/api/v1/orders?internal=true", "customer");
    expect(unknown.status).toBe(400);
    expect(orderService.listAdminOrders).not.toHaveBeenCalled();
    expect(orderService.listCustomerOrders).not.toHaveBeenCalled();
  });

  function request(path: string, token: string): Promise<Response> {
    return fetch(baseUrl + path, {
      headers: { authorization: `Bearer ${token}` },
    });
  }
});
