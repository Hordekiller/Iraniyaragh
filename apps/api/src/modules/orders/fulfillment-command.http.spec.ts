import "reflect-metadata";

import { Module, VersioningType, type INestApplication } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
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
import { FulfillmentCommandController } from "./fulfillment-command.controller";
import { FulfillmentCommandService } from "./fulfillment-command.service";

const base = {
  sessionId: "fulfillment-session",
  tokenId: "fulfillment-token",
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
};
const principals: Record<string, AuthPrincipalContext> = {
  customer: {
    ...base,
    userId: "customer-1",
    authenticationLevel: "CUSTOMER_OTP",
    permissions: new Set(),
  },
  staff: {
    ...base,
    userId: "staff-1",
    authenticationLevel: "STAFF_MFA",
    permissions: new Set(["orders.manage"]),
  },
  denied: {
    ...base,
    userId: "staff-2",
    authenticationLevel: "STAFF_MFA",
    permissions: new Set(["orders.read"]),
  },
};
const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string) => {
    const principal = authorization?.startsWith("Bearer ")
      ? principals[authorization.slice(7)]
      : undefined;
    if (!principal) throw new AuthSessionException("AUTH_SESSION_INVALID");
    return principal;
  }),
};
const commands = {
  execute: vi.fn(async (orderId: string, command: string) => ({
    data: {
      fulfillment: {
        orderId,
        status: command === "start" ? "PROCESSING" : "READY_TO_SHIP",
      },
    },
  })),
};

@Module({
  imports: [ApiFoundationModule],
  controllers: [FulfillmentCommandController],
  providers: [
    { provide: FulfillmentCommandService, useValue: commands },
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
class TestModule {}

describe("Fulfillment command HTTP authorization", () => {
  let app: INestApplication;
  let baseUrl: string;
  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false });
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());

  it.each(["start", "ready"] as const)(
    "%s refuses anonymous, customer and unprivileged staff tokens",
    async (command) => {
      const path = `/api/v1/orders/admin/order-1/fulfillment/${command}`;
      expect((await request(path)).status).toBe(401);
      expect((await request(path, "customer")).status).toBe(403);
      expect((await request(path, "denied")).status).toBe(403);
      expect(commands.execute).not.toHaveBeenCalled();
    },
  );

  it("requires a valid key and forwards only the authenticated staff actor", async () => {
    const path = "/api/v1/orders/admin/order-1/fulfillment/start";
    expect((await request(path, "staff", "")).status).toBe(400);
    const response = await request(path, "staff", "key-1");
    expect(response.status, await response.clone().text()).toBe(200);
    expect(commands.execute).toHaveBeenCalledWith(
      "order-1",
      "start",
      expect.objectContaining({ actorId: "staff-1", idempotencyKey: "key-1" }),
    );
  });

  function request(
    path: string,
    token?: string,
    key: string | undefined = "key-1",
  ) {
    return fetch(baseUrl + path, {
      method: "POST",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(key ? { "idempotency-key": key } : {}),
      },
    });
  }
});
