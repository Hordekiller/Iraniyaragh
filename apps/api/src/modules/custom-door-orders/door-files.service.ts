import { createHash, randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  StreamableFile,
  UnprocessableEntityException,
} from "@nestjs/common";
import { fileTypeFromBuffer } from "file-type";
import { Readable } from "node:stream";
import { PrismaService } from "../../database/prisma.service";
import {
  PRODUCT_MEDIA_STORAGE,
  type ProductMediaStorage,
} from "../media/storage.port";
import {
  PRODUCT_MEDIA_MALWARE_SCANNER,
  type ProductMediaMalwareScanner,
} from "../media/malware-scanner.port";
import {
  DoorOrdersService,
  lockDoorOrder,
  type DoorActor,
} from "./door-orders.service";
import { doorConflict } from "./door-catalog.service";

@Injectable()
export class DoorFilesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoorOrdersService) private readonly orders: DoorOrdersService,
    @Inject(PRODUCT_MEDIA_STORAGE)
    private readonly storage: ProductMediaStorage,
    @Inject(PRODUCT_MEDIA_MALWARE_SCANNER)
    private readonly scanner: ProductMediaMalwareScanner,
  ) {}
  async upload(
    actor: DoorActor,
    id: string,
    file: { buffer: Buffer; originalname: string } | undefined,
  ) {
    const order = await this.orders.detail(actor, id);
    if (["COMPLETED", "CANCELLED"].includes(order.status))
      doorConflict("سفارش بسته شده است.");
    if (!file?.buffer.length || file.buffer.length > 8 * 1024 * 1024)
      throw new UnprocessableEntityException(
        "حداکثر اندازه فایل هشت مگابایت است.",
      );
    const detected = await fileTypeFromBuffer(file.buffer);
    if (
      !detected ||
      !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
        detected.mime,
      )
    )
      throw new UnprocessableEntityException(
        "فقط تصویر JPEG، PNG، WebP یا PDF مجاز است.",
      );
    if ((await this.scanner.scan(file.buffer)) !== "CLEAN")
      throw new ServiceUnavailableException(
        "فایل تأیید نشد؛ اسکن فایل باید فعال و موفق باشد.",
      );
    const digest = createHash("sha256").update(file.buffer).digest("hex");
    const fileId = randomUUID();
    // Existing storage bucket grants public reads only to renditions/*.
    // Source/quarantine objects are accessible solely through this guarded API.
    const objectKey = `quarantine/custom-doors/${id}/${digest}.${detected.ext}`;
    await this.storage.putObject({
      objectKey,
      body: file.buffer,
      contentType: detected.mime,
      checksumSha256: digest,
    });
    const filename =
      [...file.originalname]
        .filter(
          (c) =>
            c.charCodeAt(0) >= 32 &&
            c.charCodeAt(0) !== 127 &&
            c !== "/" &&
            c !== "\\",
        )
        .join("")
        .slice(0, 150) || `reference.${detected.ext}`;
    return await this.prisma.$transaction(async (tx) => {
      await lockDoorOrder(tx, id);
      const current = await this.orders.owned(tx, actor, id);
      if (["COMPLETED", "CANCELLED"].includes(current.status))
        doorConflict("سفارش بسته شده است.");
      const existing = await tx.doorAttachment.findUnique({
        where: {
          orderId_checksumSha256: { orderId: id, checksumSha256: digest },
        },
        select: { id: true, filename: true, mime: true, bytes: true },
      });
      if (existing) return existing;
      if ((await tx.doorAttachment.count({ where: { orderId: id } })) >= 20)
        doorConflict("حداکثر بیست فایل برای هر سفارش مجاز است.");
      const item = await tx.doorAttachment.create({
        data: {
          id: fileId,
          orderId: id,
          filename,
          mime: detected.mime,
          bytes: file.buffer.length,
          objectKey,
          checksumSha256: digest,
        },
        select: { id: true, filename: true, mime: true, bytes: true },
      });
      await tx.doorProductionRecord.create({
        data: {
          orderId: id,
          action: "FILE_ATTACHED",
          message: "فایل مرجع به سفارش اضافه شد.",
          actorId: actor.userId,
          payload: { attachmentId: fileId },
        },
      });
      return item;
    });
  }

  async download(actor: DoorActor, id: string, attachmentId: string) {
    await this.orders.detail(actor, id);
    const attachment = await this.prisma.doorAttachment.findFirst({
      where: { id: attachmentId, orderId: id },
    });
    if (!attachment) throw new UnprocessableEntityException("فایل یافت نشد.");
    const stream = await this.storage.getObject(attachment.objectKey);
    return new StreamableFile(stream as Readable, {
      type: attachment.mime,
      disposition: `attachment; filename="reference.${attachment.mime === "application/pdf" ? "pdf" : "img"}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      length: attachment.bytes,
    });
  }
}
