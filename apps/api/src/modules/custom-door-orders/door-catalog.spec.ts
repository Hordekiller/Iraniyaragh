import { beforeEach, describe, expect, it, vi } from "vitest";
import { DoorCatalogService } from "./door-catalog.service";
import { pricingFixture } from "./door.test-fixtures";
import type { PrismaService } from "../../database/prisma.service";
import type { AuditLogService } from "../audit/audit-log.service";
import type { MediaService } from "../media/media.service";
import type { DoorModelWriteDto, DoorMaterialWriteDto } from "./door.dto";

function fixture() {
  const f = pricingFixture();
  const model: DoorModelWriteDto = {
    code: f.model.code,
    title: f.model.title,
    type: f.model.type,
    active: true,
    expectedVersion: 0,
    imageMediaId: null,
    configuration: f.cfg,
  };
  const material: DoorMaterialWriteDto = {
    code: f.materials[0].code,
    title: f.materials[0].title,
    category: "GLASS",
    active: true,
    expectedVersion: 0,
    variantId: null,
    configuration: f.materials[0].configuration,
  };
  return { ...f, modelInput: model, materialInput: material };
}
function setup() {
  const db = {
    doorModel: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "test-model", version: 1 }),
    },
    doorMaterial: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "test-material", version: 1 }),
    },
    doorCatalogRevision: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    productMedia: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    productVariant: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "test-sku", inventoryUnit: "PIECE" }),
      update: vi.fn(),
    },
    inventoryBalance: { count: vi.fn().mockResolvedValue(0) },
    inventoryMovement: { count: vi.fn().mockResolvedValue(0) },
    stockReservation: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(
    async (f: (tx: unknown) => Promise<unknown>) => f(db),
  );
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const media = {
    listPicker: vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: "ready-image", url: "https://example.test/approved.webp" },
        ],
      },
    }),
  };
  const service = new DoorCatalogService(
    db as unknown as PrismaService,
    audit as unknown as AuditLogService,
    media as unknown as MediaService,
  );
  return { db, audit, media, service };
}
describe("Door catalog safeguards and revision evidence", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });
  it("projects only active public models with READY media and keeps the admin projection separate", async () => {
    const f = fixture();
    s.db.doorModel.findMany.mockResolvedValue([
      { ...f.model, imageMediaId: "ready-image" },
      { ...f.model, id: "without-image", imageMediaId: null },
    ]);
    s.db.doorMaterial.findMany.mockResolvedValue(f.materials);
    s.db.productMedia.findMany.mockResolvedValue([
      { id: "ready-image", productId: "test-product" },
    ]);
    const result = await s.service.catalog();
    expect(result.models[0].imageUrl).toBe(
      "https://example.test/approved.webp",
    );
    expect(result.models[1].imageUrl).toBeNull();
    expect(s.db.productMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ state: "READY", kind: "IMAGE" }),
      }),
    );
    expect(s.db.doorModel.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
    await s.service.catalog(true);
    expect(s.db.doorModel.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
  it("keeps visibility and notification revisions versioned and actor attributed", async () => {
    expect(await s.service.floatingVisibility()).toEqual({ enabled: true });
    expect(await s.service.notificationSettings()).toEqual({
      version: 0,
      templateId: null,
    });
    await s.service.visibility("staff", "request", 0, false);
    await s.service.notification("staff", "request", 0, 123);
    expect(s.db.doorCatalogRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "VISIBILITY",
        version: 1,
        snapshot: { enabled: false },
        actorId: "staff",
      }),
    });
    expect(s.audit.record).toHaveBeenCalledTimes(2);
    s.db.doorCatalogRevision.findFirst.mockResolvedValue({
      version: 3,
      snapshot: { enabled: false, templateId: 123 },
    });
    expect(await s.service.floatingVisibility()).toEqual({ enabled: false });
    expect(await s.service.notificationSettings()).toEqual({
      version: 3,
      templateId: 123,
    });
    await expect(
      s.service.visibility("staff", "request", 1, true),
    ).rejects.toThrow();
    await s.service.history("MODEL", "test-model");
    expect(s.db.doorCatalogRevision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        where: { entityType: "MODEL", entityId: "test-model" },
      }),
    );
  });
  it("records a valid technical configuration with a new immutable revision", async () => {
    const f = fixture();
    f.cfg.additional = [{ title: "TEST ONLY processing", amount: "10" }];
    f.cfg.incompatible = [
      { materialIds: ["glass", "profile"], reason: "TEST ONLY compatibility" },
    ];
    f.modelInput.imageMediaId = "ready-image";
    s.db.doorMaterial.count.mockResolvedValue(3);
    s.db.productMedia.findFirst.mockResolvedValue({ id: "ready-image" });
    expect(await s.service.writeModel("staff", "request", f.modelInput)).toBe(
      "test-model",
    );
    expect(s.db.doorModel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ version: 1, configuration: f.cfg }),
      }),
    );
    expect(s.db.doorCatalogRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "MODEL",
        actorId: "staff",
        version: 1,
      }),
    });
    expect(s.db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });
  it.each([
    "missing-rules",
    "dimensions",
    "duplicate-slots",
    "unknown-component",
    "unknown-material",
    "incompatible-material",
    "unready-image",
    "stale-version",
  ])("refuses %s without persisting catalog changes", async (failure) => {
    const f = fixture();
    s.db.doorMaterial.count.mockResolvedValue(3);
    if (failure === "missing-rules")
      delete (f.cfg as Partial<typeof f.cfg>).technical;
    if (failure === "dimensions") f.cfg.technical!.minWidthMm = 4000;
    if (failure === "duplicate-slots") f.cfg.slots.push(f.cfg.slots[0]);
    if (failure === "unknown-component") f.cfg.components[0].slot = "unknown";
    if (failure === "unknown-material")
      s.db.doorMaterial.count.mockResolvedValue(2);
    if (failure === "incompatible-material")
      f.cfg.incompatible = [
        { materialIds: ["glass", "outside"], reason: "TEST ONLY" },
      ];
    if (failure === "unready-image")
      f.modelInput.imageMediaId = "quarantine-image";
    if (failure === "stale-version") f.modelInput.expectedVersion = 5;
    await expect(
      s.service.writeModel("staff", "request", f.modelInput),
    ).rejects.toThrow();
    expect(s.db.doorModel.upsert).not.toHaveBeenCalled();
    expect(s.audit.record).not.toHaveBeenCalled();
  });
  it("updates material prices under optimistic concurrency with stock unit consistency", async () => {
    const f = fixture();
    f.materialInput.variantId = "test-sku";
    f.materialInput.configuration.stockUnit = "MM2";
    s.db.productVariant.findUnique.mockResolvedValue({
      id: "test-sku",
      inventoryUnit: "MM2",
    });
    s.db.doorMaterial.findMany.mockResolvedValue([
      { configuration: { stockUnit: "MM2" } },
    ]);
    expect(
      await s.service.writeMaterial("staff", "request", f.materialInput),
    ).toBe("test-material");
    expect(s.db.doorCatalogRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "MATERIAL",
        actorId: "staff",
      }),
    });
  });
  it.each([
    "undefined",
    "missing-unit",
    "service-sku",
    "unknown-sku",
    "wrong-unit",
    "conflicting-unit",
    "stale-version",
  ])("rejects %s material configuration before any write", async (failure) => {
    const f = fixture();
    f.materialInput.variantId = "test-sku";
    f.materialInput.configuration.stockUnit = "PIECE";
    if (failure === "undefined")
      delete (
        f.materialInput.configuration as Partial<
          typeof f.materialInput.configuration
        >
      ).rate;
    if (failure === "missing-unit")
      f.materialInput.configuration.stockUnit = null;
    if (failure === "service-sku") f.materialInput.category = "SERVICE";
    if (failure === "unknown-sku")
      s.db.productVariant.findUnique.mockResolvedValue(null);
    if (failure === "wrong-unit")
      f.materialInput.configuration.stockUnit = "MM2";
    if (failure === "conflicting-unit")
      s.db.doorMaterial.findMany.mockResolvedValue([
        { configuration: { stockUnit: "MM" } },
      ]);
    if (failure === "stale-version") f.materialInput.expectedVersion = 5;
    await expect(
      s.service.writeMaterial("staff", "request", f.materialInput),
    ).rejects.toThrow();
    expect(s.db.doorMaterial.upsert).not.toHaveBeenCalled();
  });
  it("allows explicit unpriced service materials without inventing a stock SKU", async () => {
    const f = fixture();
    f.materialInput.category = "SERVICE";
    f.materialInput.configuration.rate = null;
    await s.service.writeMaterial("staff", "request", f.materialInput);
    expect(s.db.productVariant.findUnique).not.toHaveBeenCalled();
    expect(s.db.doorMaterial.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          variantId: null,
          configuration: expect.objectContaining({ rate: null }),
        }),
      }),
    );
  });
  it("configures a new SKU once and rejects base-unit changes with any stock history", async () => {
    await s.service.stockUnit("staff", "request", "test-sku", "MM");
    expect(s.db.productVariant.update).toHaveBeenCalledWith({
      where: { id: "test-sku" },
      data: { inventoryUnit: "MM" },
    });
    for (const table of [
      s.db.inventoryBalance,
      s.db.inventoryMovement,
      s.db.stockReservation,
      s.db.doorMaterial,
    ]) {
      table.count.mockResolvedValueOnce(1);
      await expect(
        s.service.stockUnit("staff", "request", "test-sku", "MM2"),
      ).rejects.toThrow();
    }
    expect(s.db.productVariant.update).toHaveBeenCalledTimes(1);
    await s.service.stockUnit("staff", "request", "test-sku", "PIECE");
    expect(s.db.productVariant.update).toHaveBeenCalledTimes(1);
    s.db.productVariant.findUnique.mockResolvedValue(null);
    await expect(
      s.service.stockUnit("staff", "request", "missing", "MM"),
    ).rejects.toThrow();
  });
});
