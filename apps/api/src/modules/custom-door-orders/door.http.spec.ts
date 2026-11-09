import "reflect-metadata";
import {
  Module,
  ValidationPipe,
  VersioningType,
  StreamableFile,
  NotFoundException,
} from "@nestjs/common";
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
    "pricing.read",
    "reports.read",
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
  detail: vi.fn(async () => ({ id: "test-order" })),
  list: vi.fn(async () => ({ items: [], count: 0 })),
  message: vi.fn(),
  submitDraft: vi.fn(),
  accept: vi.fn(),
  transition: vi.fn(),
  technical: vi.fn(),
  materialAction: vi.fn(),
  report: vi.fn(async () => ({ count: 0 })),
  invoiceAddresses: vi.fn(async () => []),
  prepareInvoiceSource: vi.fn(async () => ({ commerceVersion: 7 })),
};
const catalogPort = {
  catalog: vi.fn(async () => ({ models: [], materials: [] })),
  floatingVisibility: vi.fn(async () => ({ enabled: true })),
  writeModel: vi.fn(async () => "test-model"),
  writeMaterial: vi.fn(async () => "test-material"),
  visibility: vi.fn(),
  stockUnit: vi.fn(),
  notification: vi.fn(),
  notificationSettings: vi.fn(async () => ({ version: 1, templateId: null })),
  history: vi.fn(async () => []),
};
const filePort = {
  upload: vi.fn(async () => ({ id: "test-file" })),
  download: vi.fn(
    async () =>
      new StreamableFile(Buffer.from("TEST ONLY reference"), {
        type: "application/pdf",
        disposition: 'attachment; filename="test.pdf"',
      }),
  ),
};
const paymentPort = {
  initiate: vi.fn(async () => ({ data: { payment: { status: "PENDING" } } })),
};
const invoicePort = {
  fromOrder: vi.fn(async () => ({ draft: { id: "test-draft" } })),
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
      useValue: catalogPort,
    },
    { provide: DoorFilesService, useValue: filePort },
    { provide: PaymentInitiationService, useValue: paymentPort },
    { provide: InvoiceDraftService, useValue: invoicePort },
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
    expect(
      (
        await post("custom-doors/admin/orders/test-order/quote", "staff", {
          ...body,
          depositPolicy: { kind: "PERCENT", value: "3000", minimum: "0" },
        })
      ).status,
    ).toBe(400);
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
  const send = (path: string, token: string, method = "GET", body?: unknown) =>
    fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": "test-http-command",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  it("passes customer identity and versions through all customer commands and checks ownership before payment", async () => {
    for (const path of [
      "custom-door-orders?offset=2&limit=5",
      "custom-door-orders/test-order",
    ])
      expect((await send(path, "customer")).status).toBe(200);
    expect(orders.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "test-user", staff: false }),
      expect.objectContaining({ offset: 2, limit: 5 }),
    );
    expect((await post("custom-door-orders/drafts", "customer")).status).toBe(
      200,
    );
    expect(orders.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ staff: false }),
      expect.anything(),
      "test-key-123",
      true,
    );
    for (const action of ["submit", "accept"])
      expect(
        (
          await post(`custom-door-orders/test-order/${action}`, "customer", {
            expectedVersion: 3,
          })
        ).status,
      ).toBe(200);
    expect(orders.accept).toHaveBeenCalledWith(
      expect.objectContaining({ staff: false }),
      "test-order",
      3,
      "test-key-123",
    );
    expect(
      (
        await post("custom-door-orders/test-order/messages", "customer", {
          message: "اطلاعات تکمیلی آزمون",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post("custom-door-orders/test-order/cancel", "customer", {
          expectedVersion: 3,
          status: "IN_PRODUCTION",
          reason: "انصراف آزمون",
        })
      ).status,
    ).toBe(200);
    expect(orders.transition).toHaveBeenCalledWith(
      expect.anything(),
      "test-order",
      expect.objectContaining({ status: "CANCELLED" }),
      "test-key-123",
    );
    orders.detail.mockRejectedValueOnce(
      new NotFoundException("TEST ONLY not owned"),
    );
    expect(
      (
        await post(
          "custom-door-orders/test-order/payment",
          "customer",
          undefined,
        )
      ).status,
    ).toBe(404);
    expect(paymentPort.initiate).not.toHaveBeenCalled();
    expect(
      (
        await post(
          "custom-door-orders/test-order/payment",
          "customer",
          undefined,
        )
      ).status,
    ).toBe(200);
    expect(paymentPort.initiate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "test-user",
        orderId: "test-order",
        idempotencyKey: "test-key-123",
      }),
    );
  });
  it("validates nested catalog configurations and protects settings against customers and read-only staff", async () => {
    const f = pricingFixture();
    const model = {
      code: f.model.code,
      title: f.model.title,
      type: f.model.type,
      active: true,
      expectedVersion: 0,
      imageMediaId: null,
      configuration: {
        ...f.cfg,
        incompatible: [
          { materialIds: ["glass", "profile"], reason: "TEST ONLY" },
        ],
        additional: [{ title: "TEST ONLY", amount: "10" }],
      },
    };
    const material = {
      code: f.materials[0].code,
      title: f.materials[0].title,
      category: "GLASS",
      active: true,
      expectedVersion: 0,
      variantId: null,
      configuration: f.materials[0].configuration,
    };
    for (const [path, body] of [
      ["models", model],
      ["materials", material],
      ["visibility", { expectedVersion: 0, enabled: false }],
      ["stock-unit", { variantId: "test-sku", unit: "MM2" }],
      ["notification", { expectedVersion: 0, templateId: 123 }],
    ] as const) {
      for (const token of ["customer", "reader"])
        expect(
          (await send(`custom-doors/admin/${path}`, token, "PUT", body)).status,
        ).toBe(403);
      expect(
        (await send(`custom-doors/admin/${path}`, "staff", "PUT", body)).status,
      ).toBe(200);
    }
    expect(catalogPort.writeModel).toHaveBeenCalledWith(
      "test-user",
      expect.any(String),
      expect.objectContaining({
        configuration: expect.objectContaining({ taxBps: f.cfg.taxBps }),
      }),
    );
    expect(
      (
        await send("custom-doors/admin/models", "staff", "PUT", {
          ...model,
          configuration: { ...model.configuration, deposit: null },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send("custom-doors/admin/models", "staff", "PUT", {
          ...model,
          configuration: {
            ...model.configuration,
            labor: { fixed: 0.1, perSquareMeter: "0" },
          },
        })
      ).status,
    ).toBe(400);
    for (const path of [
      "catalog",
      "notification",
      "history/MODEL/test-model",
      "report",
      "orders?limit=10",
      "orders/test-order",
      "orders/test-order/invoice-addresses",
    ])
      expect((await send(`custom-doors/admin/${path}`, "staff")).status).toBe(
        200,
      );
    expect((await fetch(`${base}/api/v1/custom-doors/visibility`)).status).toBe(
      200,
    );
  });
  it("protects production consumption, release and invoice bridging with combined permissions", async () => {
    const transition = {
      expectedVersion: 4,
      status: "COMPLETED",
      reason: "TEST ONLY تأیید",
      delivery: {
        recipient: "TEST ONLY",
        address: "نشانی ساختگی آزمون",
        tracking: "TEST",
      },
    };
    for (const action of [
      "technical",
      "status",
      "messages",
      "invoice-source",
      "materials/test-bom/consume",
      "materials/test-bom/release",
    ]) {
      const body =
        action === "messages"
          ? { message: "پیام آزمون" }
          : action === "invoice-source"
            ? { expectedVersion: 4, addressId: "test-address" }
            : transition;
      expect(
        (
          await post(
            `custom-doors/admin/orders/test-order/${action}`,
            "customer",
            body,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await post(
            `custom-doors/admin/orders/test-order/${action}`,
            "staff",
            body,
          )
        ).status,
      ).toBe(200);
    }
    for (const action of [
      "invoice-source",
      "materials/test-bom/consume",
      "materials/test-bom/release",
    ]) {
      const body =
        action === "invoice-source"
          ? { expectedVersion: 4, addressId: "test-address" }
          : transition;
      expect(
        (
          await post(
            `custom-doors/admin/orders/test-order/${action}`,
            "manager",
            body,
          )
        ).status,
      ).toBe(403);
    }
    expect(invoicePort.fromOrder).toHaveBeenCalledWith(
      "test-user",
      expect.any(String),
      "test-order",
      { expectedOrderVersion: 7, note: null },
      "test-key-123",
    );
    expect(orders.materialAction).toHaveBeenCalledWith(
      expect.objectContaining({ staff: true }),
      "test-order",
      "test-bom",
      "consume",
      4,
      transition.reason,
      "test-key-123",
    );
  });
  it("serves private references through authenticated endpoints with no-store", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob(["TEST ONLY reference"], { type: "application/pdf" }),
      "test.pdf",
    );
    const uploaded = await fetch(
      `${base}/api/v1/custom-door-orders/test-order/files`,
      {
        method: "POST",
        headers: { authorization: "Bearer customer" },
        body: form,
      },
    );
    expect(uploaded.status).toBe(200);
    expect(filePort.upload).toHaveBeenCalledWith(
      expect.objectContaining({ staff: false }),
      "test-order",
      expect.objectContaining({ originalname: "test.pdf" }),
    );
    for (const [prefix, token] of [
      ["custom-door-orders", "customer"],
      ["custom-doors/admin/orders", "staff"],
    ]) {
      const response = await send(
        `${prefix}/test-order/files/test-file`,
        token,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("content-disposition")).toContain(
        "attachment",
      );
    }
  });
});
