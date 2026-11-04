import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  DoorCatalog,
  DoorMaterial,
  DoorModel,
} from "@iranyaragh/contracts";
import { PrismaService } from "../../database/prisma.service";
import {
  isPrismaTransactionConflict,
  withSerializableRetry,
} from "../../common/serializable-retry";
import { AuditLogService } from "../audit/audit-log.service";
import { MediaService } from "../media/media.service";
import type { DoorMaterialWriteDto, DoorModelWriteDto } from "./door.dto";
import { depositFor, doorMoney } from "./door-pricing";

export const asDoorJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function doorConflict(message: string): never {
  throw new ConflictException({ code: "DOOR_STATE_CONFLICT", message });
}
export function assertDoorVersion(expected: number, actual: number) {
  if (expected !== actual)
    doorConflict("اطلاعات تغییر کرده است؛ صفحه را تازه کنید.");
}

@Injectable()
export class DoorCatalogService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Inject(MediaService) private readonly media: MediaService,
  ) {}

  async floatingVisibility() {
    const row = await this.prisma.doorCatalogRevision.findFirst({
      where: { entityType: "VISIBILITY", entityId: "floating" },
      orderBy: { version: "desc" },
    });
    return {
      enabled:
        (row?.snapshot as { enabled?: boolean } | undefined)?.enabled ?? true,
    };
  }
  async catalog(
    admin = false,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<DoorCatalog> {
    const [models, materials, setting] = await Promise.all([
      tx.doorModel.findMany({
        where: admin ? {} : { active: true },
        orderBy: { title: "asc" },
      }),
      tx.doorMaterial.findMany({
        where: admin ? {} : { active: true },
        orderBy: { title: "asc" },
      }),
      tx.doorCatalogRevision.findFirst({
        where: { entityType: "VISIBILITY", entityId: "floating" },
        orderBy: { version: "desc" },
      }),
    ]);
    const images = new Map<string, string>();
    const originalSizes = new Map<string, { width: number | null; height: number | null }>();
    // MediaService is the existing READY-only public projection; private keys are never returned.
    const imageIds = [
      ...new Set(
        [...models.map(m => m.imageMediaId), ...materials.map(m => (m.configuration as unknown as DoorMaterial["configuration"]).imageMediaId)]
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    if (imageIds.length) {
      const rows = await this.media.publicImageReferences(imageIds, tx);
      for (const image of rows) {
        images.set(image.id, image.url);
        originalSizes.set(image.id, { width: image.originalWidth ?? null, height: image.originalHeight ?? null });
      }
    }
    return {
      models: models.map((m) => ({
        ...m,
        configuration: m.configuration as unknown as DoorModel["configuration"],
        type: m.type as DoorModel["type"],
        imageUrl: images.get(m.imageMediaId ?? "") ?? null,
        imageOriginalWidth: originalSizes.get(m.imageMediaId ?? "")?.width ?? null,
        imageOriginalHeight: originalSizes.get(m.imageMediaId ?? "")?.height ?? null,
      })),
      materials: materials.map((m) => ({
        imageUrl: images.get((m.configuration as unknown as DoorMaterial["configuration"]).imageMediaId ?? "") ?? null,
        imageOriginalWidth: originalSizes.get((m.configuration as unknown as DoorMaterial["configuration"]).imageMediaId ?? "")?.width ?? null,
        imageOriginalHeight: originalSizes.get((m.configuration as unknown as DoorMaterial["configuration"]).imageMediaId ?? "")?.height ?? null,
        ...m,
        category: m.category as DoorMaterial["category"],
        configuration:
          m.configuration as unknown as DoorMaterial["configuration"],
      })),
      floatingEnabled:
        (setting?.snapshot as { enabled?: boolean } | undefined)?.enabled ??
        true,
      settingsVersion: setting?.version ?? 0,
    };
  }

  async writeModel(
    actorId: string,
    requestId: string,
    input: DoorModelWriteDto,
  ) {
    const cfg = input.configuration;
    if (
      !cfg ||
      cfg.technical === undefined ||
      cfg.deposit === undefined ||
      cfg.labor === undefined
    )
      throw new BadRequestException(
        "قواعد فنی، اجرت و بیعانه باید صریح تعیین یا نامشخص اعلام شوند.",
      );
    if (
      cfg.technical &&
      (cfg.technical.minWidthMm > cfg.technical.maxWidthMm ||
        cfg.technical.minHeightMm > cfg.technical.maxHeightMm)
    )
      throw new BadRequestException("دامنه ابعاد نامعتبر است.");
    if (cfg.deposit) depositFor(100n, cfg.deposit);
    doorMoney(cfg.discount);
    doorMoney(cfg.minimumTotal);
    if (cfg.labor) {
      doorMoney(cfg.labor.fixed);
      doorMoney(cfg.labor.perSquareMeter);
    }
    cfg.additional.forEach((a) => doorMoney(a.amount));
    if (new Set(cfg.slots.map((s) => s.key)).size !== cfg.slots.length)
      throw new BadRequestException("کلید گزینه‌ها باید یکتا باشد.");
    if (cfg.components.some((c) => !cfg.slots.some((s) => s.key === c.slot)))
      throw new BadRequestException(
        "قاعده قیمت به گزینه ناشناخته اشاره می‌کند.",
      );
    return this.transaction(async (tx) => {
      const materialIds = [...new Set(cfg.slots.flatMap((s) => s.materialIds))];
      if (
        materialIds.length &&
        (await tx.doorMaterial.count({
          where: { id: { in: materialIds } },
        })) !== materialIds.length
      )
        throw new BadRequestException(
          "متریال ناشناخته در تنظیم مدل وجود دارد.",
        );
      if (
        cfg.incompatible.some((r) =>
          r.materialIds.some((id) => !materialIds.includes(id)),
        )
      )
        throw new BadRequestException(
          "قاعده ناسازگاری به متریال خارج از مدل اشاره می‌کند.",
        );
      if (input.imageMediaId) {
        const image = await tx.productMedia.findFirst({
          where: { id: input.imageMediaId, state: "READY", kind: "IMAGE" },
          select: { id: true },
        });
        if (!image)
          throw new BadRequestException(
            "تصویر باید از رسانه‌های آماده و تأییدشده انتخاب شود.",
          );
      }
      const current = await tx.doorModel.findUnique({
        where: { code: input.code },
      });
      assertDoorVersion(input.expectedVersion, current?.version ?? 0);
      const data = {
        title: input.title,
        type: input.type,
        active: input.active,
        configuration: asDoorJson(cfg),
        imageMediaId: input.imageMediaId,
        version: (current?.version ?? 0) + 1,
      };
      const row = await tx.doorModel.upsert({
        where: { code: input.code },
        create: { code: input.code, ...data },
        update: data,
      });
      await this.revision(
        tx,
        actorId,
        requestId,
        "MODEL",
        row.id,
        row.version,
        row,
      );
      return row.id;
    });
  }
  async writeMaterial(
    actorId: string,
    requestId: string,
    input: DoorMaterialWriteDto,
  ) {
    const cfg = input.configuration;
    if (
      cfg.rate === undefined ||
      cfg.stockUnit === undefined ||
      cfg.thicknessMm === undefined ||
      cfg.validUntil === undefined ||
      input.variantId === undefined
    )
      throw new BadRequestException("فیلدهای نامشخص را صریحاً null وارد کنید.");
    if (cfg.rate !== null) doorMoney(cfg.rate);
    doorMoney(cfg.processingFee);
    if (input.variantId && (!cfg.stockUnit || input.category === "SERVICE"))
      throw new BadRequestException(
        "برای اتصال موجودی، واحد واقعی مصرف را مشخص کنید؛ خدمت به SKU متصل نمی‌شود.",
      );
    return this.transaction(async (tx) => {
      if (cfg.imageMediaId) {
        const image = await tx.productMedia.findFirst({ where: { id: cfg.imageMediaId, state: "READY", kind: "IMAGE" }, select: { id: true } });
        if (!image) throw new BadRequestException("تصویر شیشه باید از رسانه‌های آماده و تأییدشده انتخاب شود.");
      }
      if (input.variantId) {
        const variant = await tx.productVariant.findUnique({
          where: { id: input.variantId },
          select: { id: true, inventoryUnit: true },
        });
        if (!variant) throw new NotFoundException("SKU یافت نشد.");
        if (variant.inventoryUnit !== cfg.stockUnit)
          throw new BadRequestException(
            "واحد متریال با واحد پایه ثبت‌شده SKU تطبیق ندارد. ابتدا واحد SKU بدون گردش قبلی را پیکربندی کنید.",
          );
      }
      // One SKU cannot mean millimetres in one material and pieces in another.
      if (input.variantId) {
        const linked = await tx.doorMaterial.findMany({
          where: { variantId: input.variantId, code: { not: input.code } },
          select: { configuration: true },
        });
        if (
          linked.some(
            (m) =>
              (m.configuration as unknown as DoorMaterial["configuration"])
                .stockUnit !== cfg.stockUnit,
          )
        )
          throw new BadRequestException(
            "واحد پایه این SKU در متریال‌های دیگر متفاوت است.",
          );
      }
      const current = await tx.doorMaterial.findUnique({
        where: { code: input.code },
      });
      assertDoorVersion(input.expectedVersion, current?.version ?? 0);
      const data = {
        title: input.title,
        category: input.category,
        active: input.active,
        variantId: input.variantId,
        configuration: asDoorJson(cfg),
        version: (current?.version ?? 0) + 1,
      };
      const row = await tx.doorMaterial.upsert({
        where: { code: input.code },
        create: { code: input.code, ...data },
        update: data,
      });
      await this.revision(
        tx,
        actorId,
        requestId,
        "MATERIAL",
        row.id,
        row.version,
        row,
      );
      return row.id;
    });
  }
  async visibility(
    actorId: string,
    requestId: string,
    expectedVersion: number,
    enabled: boolean,
  ) {
    return this.transaction(async (tx) => {
      const current = await tx.doorCatalogRevision.findFirst({
        where: { entityType: "VISIBILITY", entityId: "floating" },
        orderBy: { version: "desc" },
      });
      assertDoorVersion(expectedVersion, current?.version ?? 0);
      await this.revision(
        tx,
        actorId,
        requestId,
        "VISIBILITY",
        "floating",
        (current?.version ?? 0) + 1,
        { enabled },
      );
    });
  }
  async stockUnit(
    actorId: string,
    requestId: string,
    variantId: string,
    unit: "PIECE" | "MM" | "MM2",
  ) {
    return this.transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { id: variantId },
      });
      if (!variant) throw new NotFoundException("SKU یافت نشد.");
      if (variant.inventoryUnit === unit) return;
      if (
        (await tx.inventoryBalance.count({ where: { variantId } })) ||
        (await tx.inventoryMovement.count({ where: { variantId } })) ||
        (await tx.stockReservation.count({ where: { variantId } })) ||
        (await tx.doorMaterial.count({ where: { variantId } }))
      )
        doorConflict(
          "واحد پایه SKU دارای موجودی، گردش یا اتصال متریال قابل تغییر نیست. SKU جدید با واحد درست ایجاد کنید.",
        );
      await tx.productVariant.update({
        where: { id: variantId },
        data: { inventoryUnit: unit },
      });
      await this.audit.record(
        {
          actorId,
          requestId,
          action: "custom-door.stock-unit.configured",
          entityType: "product-variant",
          entityId: variantId,
          before: { unit: variant.inventoryUnit },
          after: { unit },
        },
        tx,
      );
    });
  }
  async notification(
    actorId: string,
    requestId: string,
    expectedVersion: number,
    templateId: number | null,
  ) {
    return this.transaction(async (tx) => {
      const current = await tx.doorCatalogRevision.findFirst({
        where: { entityType: "NOTIFICATION", entityId: "quote-approved" },
        orderBy: { version: "desc" },
      });
      assertDoorVersion(expectedVersion, current?.version ?? 0);
      await this.revision(
        tx,
        actorId,
        requestId,
        "NOTIFICATION",
        "quote-approved",
        (current?.version ?? 0) + 1,
        { templateId },
      );
    });
  }
  async notificationSettings() {
    const current = await this.prisma.doorCatalogRevision.findFirst({
      where: { entityType: "NOTIFICATION", entityId: "quote-approved" },
      orderBy: { version: "desc" },
    });
    return {
      version: current?.version ?? 0,
      templateId:
        (current?.snapshot as { templateId: number | null } | undefined)
          ?.templateId ?? null,
    };
  }
  async history(entityType: string, entityId: string) {
    return this.prisma.doorCatalogRevision.findMany({
      where: { entityType, entityId },
      orderBy: { version: "desc" },
      take: 100,
    });
  }
  private async revision(
    tx: Prisma.TransactionClient,
    actorId: string,
    requestId: string,
    entityType: string,
    entityId: string,
    version: number,
    snapshot: unknown,
  ) {
    await tx.doorCatalogRevision.create({
      data: {
        entityType,
        entityId,
        version,
        snapshot: asDoorJson(snapshot),
        actorId,
      },
    });
    await this.audit.record(
      {
        actorId,
        requestId,
        action: "custom-door.catalog.updated",
        entityType,
        entityId,
        metadata: { version },
      },
      tx,
    );
  }
  private transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return withSerializableRetry({
      isContention: isPrismaTransactionConflict,
      conflictMessage: "تعرفه هم‌زمان تغییر کرد؛ دوباره بررسی کنید.",
      operation: () =>
        this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }),
    });
  }
}
