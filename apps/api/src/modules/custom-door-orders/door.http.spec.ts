import "reflect-metadata";
import { Module, ValidationPipe, VersioningType } from "@nestjs/common";
import { APP_GUARD, NestFactory, type INestApplication } from "@nestjs/core";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ApiFoundationModule } from "../../common/api-foundation.module";
import { AuthGuard } from "../auth/auth.guard";
import {
  AuthPrincipalService,
  type AuthPrincipalContext,
} from "../auth/auth-principal.service";
import { AuthSessionException } from "../auth/auth-session.service";
import { AuditLogService } from "../audit/audit-log.service";
import { RateLimitService } from "../auth/rate-limit.service";
import { InvoiceDraftService } from "../invoices/invoice-draft.service";
import { PaymentInitiationService } from "../payments/payment-initiation.service";
import {
  DoorAdminController,
  DoorCustomerController,
  DoorPublicController,
} from "./door.controller";
import { DoorOrdersService } from "./door-orders.service";
import { DoorCatalogService } from "./door-catalog.service";
import { DoorFilesService } from "./door-files.service";
import { pricingFixture } from "./door.test-fixtures";
const principal = (
  authenticationLevel: "CUSTOMER_OTP" | "STAFF_MFA",
  permissions: string[],
  old = false,
): AuthPrincipalContext => ({
  userId: "test-user",
  sessionId: "test-session",
  tokenId: "test-token",
  authenticatedAt: new Date(Date.now() - (old ? 600000 : 1000)),
  accessExpiresAt: new Date(Date.now() + 600000),
  authenticationLevel,
  permissions: new Set(permissions),
});
const principals = {
  customer: principal("CUSTOMER_OTP", []),
  staff: principal("STAFF_MFA", [
    "orders.read",
    "orders.manage",
    "pricing.write",
    "inventory.adjust",
    "catalog.read",
    "catalog.write",
    "settings.manage",
    "customers.read",
    "invoices.write",
  ]),
  manager: principal("STAFF_MFA", ["orders.read", "orders.manage"]),
  reader: principal("STAFF_MFA", ["orders.read"]),
  stale: principal("STAFF_MFA", ["orders.manage", "pricing.write"], true),
};
const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string) => {
    const id = authorization?.replace("Bearer ", "") as keyof typeof principals;
    if (principals[id]) return principals[id];
    throw new AuthSessionException("AUTH_SESSION_INVALID");
  }),
};
const audit = { record: vi.fn() };
const orders = {
  replaceDraft: vi.fn(async () => ({ id: "test-order" })),
  create: vi.fn(async () => ({ id: "test-order" })),
  approveQuote: vi.fn(async () => ({ id: "test-order" })),
  reserve: vi.fn(async () => ({ id: "test-order" })),
  preview: vi.fn(async () => ({ total: null })),
  detail: vi.fn(),
  list: vi.fn(async () => ({ items: [], count: 0 })),
  message: vi.fn(),
};
const limits = { enforce: vi.fn(async () => ({ allowed: true })) };
@Module({
  imports: [ApiFoundationModule],
  controllers: [
    DoorPublicController,
    DoorAdminController,
    DoorCustomerController,
  ],
  providers: [
    { provide: DoorOrdersService, useValue: orders },
    {
      provide: DoorCatalogService,
      useValue: {
        catalog: vi.fn(async () => ({ models: [], materials: [] })),
        floatingVisibility: vi.fn(async () => ({ enabled: true })),
      },
    },
    { provide: DoorFilesService, useValue: {} },
    { provide: PaymentInitiationService, useValue: {} },
    { provide: InvoiceDraftService, useValue: {} },
    { provide: RateLimitService, useValue: limits },
    {
      provide: APP_GUARD,
      useValue: new AuthGuard(
        principalService as unknown as AuthPrincipalService,
        audit as unknown as AuditLogService,
      ),
    },
  ],
})
class TestModule {}
describe("Custom door HTTP authorization and input boundary", () => {
  let app: INestApplication, base: string;
  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false });
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
    base = await app.getUrl();
  });
  afterAll(async () => app.close());
  beforeEach(() => vi.clearAllMocks());
  const post = (
    path: string,
    token?: string,
    body: unknown = { items: [pricingFixture().item] },
    key: string | null = "test-key-123",
  ) =>
    fetch(`${base}/api/v1/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(key ? { "idempotency-key": key } : {}),
      },
      body: JSON.stringify(body),
    });
  it("requires current customer OTP sessions for customer mutations", async () => {
    expect((await post("custom-door-orders")).status).toBe(401);
    expect((await post("custom-door-orders", "staff")).status).toBe(403);
    expect(orders.create).not.toHaveBeenCalled();
    expect((await post("custom-door-orders", "customer")).status).toBe(200);
    expect(limits.enforce).toHaveBeenCalled();
  });
  it("rejects client money, invalid dimensions and unknown model properties before service execution", async () => {
    const item = pricingFixture().item;
    for (const payload of [
      { items: [{ ...item, unitPrice: "1" }] },
      { items: [{ ...item, widthMm: -1 }] },
      { items: [], grandTotal: "1" },
    ])
      expect(
        (await post("custom-door-orders", "customer", payload)).status,
      ).toBe(400);
    expect(orders.create).not.toHaveBeenCalled();
  });
  it("normalizes Persian dimensions and requires replay keys", async () => {
    const item = pricingFixture().item;
    expect(
      (
        await post("custom-door-orders", "customer", {
          items: [{ ...item, widthMm: "۵۰۰", heightMm: "۱۰۰۰", quantity: "۲" }],
        })
      ).status,
    ).toBe(200);
    expect(orders.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        items: [
          expect.objectContaining({
            widthMm: 500,
            heightMm: 1000,
            quantity: 2,
          }),
        ],
      }),
      "test-key-123",
    );
    expect(
      (await post("custom-door-orders", "customer", { items: [item] }, null))
        .status,
    ).toBe(400);
  });
  it("requires a versioned draft body without introducing a CORS-only concurrency header", async () => {
    const send = (body: unknown) =>
      fetch(`${base}/api/v1/custom-door-orders/test-order/draft`, {
        method: "PUT",
        headers: {
          authorization: "Bearer customer",
          "content-type": "application/json",
          "idempotency-key": "test-draft-key",
        },
        body: JSON.stringify(body),
      });
    const items = [pricingFixture().item];
    expect((await send({ items })).status).toBe(400);
    expect((await send({ items, expectedVersion: 1 })).status).toBe(200);
    expect(orders.replaceDraft).toHaveBeenCalledWith(
      expect.anything(),
      "test-order",
      expect.objectContaining({ items }),
      1,
      "test-draft-key",
    );
  });
  it("requires both quote-management permissions and fresh staff authentication", async () => {
    const body = {
      expectedVersion: 1,
      total: "100",
      lineTotals: [{ total: "100", reason: "آزمون" }],
      depositPolicy: { kind: "FIXED", value: "30", minimum: "0" },
      adjustments: [],
      reason: "تأیید آزمون",
    };
    for (const token of ["customer", "reader", "manager", "stale"])
      expect(
        (await post("custom-doors/admin/orders/test-order/quote", token, body))
          .status,
      ).toBe(token === "stale" ? 401 : 403);
    expect(orders.approveQuote).not.toHaveBeenCalled();
    expect(
      (await post("custom-doors/admin/orders/test-order/quote", "staff", body))
        .status,
    ).toBe(200);
  });
  it("requires inventory permission in addition to order management for stock reservations", async () => {
    const body = {
      expectedVersion: 1,
      warehouseId: "test-wh",
      locationId: "test-loc",
      actualStockQuantity: 2,
      expiresAt: "2030-01-01T00:00:00Z",
      reason: "برنامه برش آزمون",
    };
    expect(
      (
        await post(
          "custom-doors/admin/orders/test-order/materials/test-bom/reserve",
          "manager",
          body,
        )
      ).status,
    ).toBe(403);
    expect(orders.reserve).not.toHaveBeenCalled();
    expect(
      (
        await post(
          "custom-doors/admin/orders/test-order/materials/test-bom/reserve",
          "staff",
          body,
        )
      ).status,
    ).toBe(200);
  });
  it("keeps public catalog/preview accessible while rate-limiting previews", async () => {
    expect((await fetch(`${base}/api/v1/custom-doors/catalog`)).status).toBe(
      200,
    );
    expect((await post("custom-doors/quote-preview")).status).toBe(200);
    expect(limits.enforce).toHaveBeenCalledWith(
      expect.objectContaining({
        dimension: "custom-doors:preview",
        context: "ip",
      }),
    );
  });
});
