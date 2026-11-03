import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
  type Type,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { getRequestId } from "../../common/request-context";
import { normalizeIdempotencyKey } from "../../common/idempotency-key";
import {
  CurrentPrincipal,
  RequireAuthentication,
  RequireFreshAuthentication,
  RequirePermission,
} from "../auth/auth.guard";
import type { AuthPrincipalContext } from "../auth/auth-principal.service";
import { RateLimitService } from "../auth/rate-limit.service";
import { PaymentInitiationService } from "../payments/payment-initiation.service";
import { InvoiceDraftService } from "../invoices/invoice-draft.service";
import { doorResponses } from "./door.openapi";
import { DoorCatalogService } from "./door-catalog.service";
import { DoorOrdersService, type DoorActor } from "./door-orders.service";
import { DoorFilesService } from "./door-files.service";
import {
  DoorInvoiceSourceDto,
  DoorStockUnitDto,
  DoorNotificationDto,
  DoorMaterialWriteDto,
  DoorMessageDto,
  DoorModelWriteDto,
  DoorOrderDto,
  DoorDraftEditDto,
  DoorPageDto,
  DoorQuoteApprovalDto,
  DoorReserveDto,
  DoorTransitionDto,
  DoorVersionDto,
  DoorVisibilityDto,
} from "./door.dto";

const validate = (expectedType: Type<unknown>) =>
  new ValidationPipe({
    expectedType,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
const actor = (
  p: AuthPrincipalContext,
  staff = false,
  permissions: string[] = [],
): DoorActor => {
  if (permissions.some((permission) => !p.permissions.has(permission)))
    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: "مجوز عملیات تکمیلی لازم است.",
    });
  return { userId: p.userId, requestId: getRequestId(), staff };
};
const header = {
  name: "Idempotency-Key",
  required: true,
  description: "Retain the same key and exact body across uncertain retries.",
};
const response = {
  description:
    "Versioned custom door domain result; monetary amounts are integer IRR strings.",
  schema: {
    type: "object",
    required: ["data"],
    properties: { data: { type: "object" } },
  },
} as const;

@ApiTags("custom-doors")
@Controller({ path: "custom-doors", version: "1" })
export class DoorPublicController {
  constructor(
    @Inject(DoorCatalogService)
    private readonly catalogService: DoorCatalogService,
    @Inject(DoorOrdersService) private readonly orders: DoorOrdersService,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}
  @Get("visibility")
  @ApiOkResponse(doorResponses.visibility)
  async visibility() {
    return { data: await this.catalogService.floatingVisibility() };
  }
  @Get("catalog")
  @ApiOperation({
    summary:
      "Active configured production models and materials; no fixture catalog.",
  })
  @ApiOkResponse(doorResponses.catalog)
  async catalog() {
    return { data: await this.catalogService.catalog() };
  }
  @Post("quote-preview")
  @HttpCode(200)
  @ApiBody({ type: DoorOrderDto })
  @ApiOkResponse(doorResponses.preview)
  async preview(
    @Req() req: Request,
    @Body(validate(DoorOrderDto)) input: DoorOrderDto,
  ) {
    await this.limits.enforce({
      dimension: "custom-doors:preview",
      context: "ip",
      value: req.ip ?? "unknown",
    });
    return { data: { quote: await this.orders.preview(input) } };
  }
}

@ApiTags("custom-door-orders")
@ApiBearerAuth("access-token")
@Controller({ path: "custom-door-orders", version: "1" })
@RequireAuthentication("CUSTOMER_OTP")
export class DoorCustomerController {
  constructor(
    @Inject(DoorOrdersService) private readonly orders: DoorOrdersService,
    @Inject(PaymentInitiationService)
    private readonly payments: PaymentInitiationService,
    @Inject(DoorFilesService) private readonly files: DoorFilesService,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}
  private async limit(p: AuthPrincipalContext) {
    await this.limits.enforce({
      dimension: "custom-doors:customer",
      context: "identifier",
      value: p.userId,
    });
  }
  @Get()
  @ApiOkResponse(doorResponses.list)
  async list(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Query(validate(DoorPageDto)) page: DoorPageDto,
  ) {
    return { data: await this.orders.list(actor(p), page) };
  }
  @Get(":id")
  @ApiOkResponse(doorResponses.order)
  async detail(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
  ) {
    return { data: { order: await this.orders.detail(actor(p), id) } };
  }
  @Post()
  @HttpCode(200)
  @ApiHeader(header)
  @ApiBody({ type: DoorOrderDto })
  @ApiOkResponse(doorResponses.order)
  async create(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorOrderDto)) input: DoorOrderDto,
  ) {
    await this.limit(p);
    return {
      data: {
        order: await this.orders.create(
          actor(p),
          input,
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Post("drafts")
  @HttpCode(200)
  @ApiHeader(header)
  @ApiBody({ type: DoorOrderDto })
  @ApiOkResponse(doorResponses.order)
  async draft(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorOrderDto)) input: DoorOrderDto,
  ) {
    await this.limit(p);
    return {
      data: {
        order: await this.orders.create(
          actor(p),
          input,
          normalizeIdempotencyKey(key),
          true,
        ),
      },
    };
  }
  @Put(":id/draft")
  @ApiHeader(header)
  @ApiBody({ type: DoorDraftEditDto })
  @ApiOkResponse(doorResponses.order)
  async edit(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorDraftEditDto)) input: DoorDraftEditDto,
  ) {
    await this.limit(p);
    return {
      data: {
        order: await this.orders.replaceDraft(
          actor(p),
          id,
          { items: input.items },
          input.expectedVersion,
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Post(":id/submit")
  @HttpCode(200)
  @ApiHeader(header)
  @ApiBody({ type: DoorVersionDto })
  @ApiOkResponse(doorResponses.order)
  async submit(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorVersionDto)) input: DoorVersionDto,
  ) {
    await this.limit(p);
    return {
      data: {
        order: await this.orders.submitDraft(
          actor(p),
          id,
          input.expectedVersion,
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Post(":id/accept")
  @HttpCode(200)
  @ApiHeader(header)
  @ApiBody({ type: DoorVersionDto })
  @ApiOkResponse(doorResponses.order)
  async accept(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorVersionDto)) input: DoorVersionDto,
  ) {
    await this.limit(p);
    return {
      data: {
        order: await this.orders.accept(
          actor(p),
          id,
          input.expectedVersion,
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Post(":id/payment")
  @HttpCode(200)
  @ApiHeader(header)
  @ApiOkResponse(response)
  async payment(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
  ) {
    await this.limit(p);
    await this.orders.detail(actor(p), id);
    return this.payments.initiate({
      userId: p.userId,
      orderId: id,
      idempotencyKey: normalizeIdempotencyKey(key),
      requestId: getRequestId(),
    });
  }
  @Post(":id/cancel")
  @HttpCode(200)
  @ApiHeader(header)
  @ApiBody({ type: DoorTransitionDto })
  @ApiOkResponse(doorResponses.order)
  async cancel(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorTransitionDto)) input: DoorTransitionDto,
  ) {
    await this.limit(p);
    return {
      data: {
        order: await this.orders.transition(
          actor(p),
          id,
          { ...input, status: "CANCELLED" },
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Post(":id/messages")
  @HttpCode(200)
  @ApiHeader(header)
  @ApiBody({ type: DoorMessageDto })
  @ApiOkResponse(doorResponses.order)
  async message(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorMessageDto)) input: DoorMessageDto,
  ) {
    await this.limit(p);
    return {
      data: {
        order: await this.orders.message(
          actor(p),
          id,
          input.message,
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Post(":id/files")
  @HttpCode(200)
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOkResponse(response)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  async upload(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ) {
    await this.limit(p);
    return {
      data: { attachment: await this.files.upload(actor(p), id, file) },
    };
  }
  @Get(":id/files/:fileId")
  @Header("Cache-Control", "private, no-store")
  async file(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Param("fileId") fileId: string,
  ) {
    return this.files.download(actor(p), id, fileId);
  }
}

@ApiTags("custom-doors-admin")
@ApiBearerAuth("access-token")
@Controller({ path: "custom-doors/admin", version: "1" })
@RequireAuthentication("STAFF_MFA")
export class DoorAdminController {
  constructor(
    @Inject(DoorCatalogService) private readonly catalog: DoorCatalogService,
    @Inject(DoorOrdersService) private readonly orders: DoorOrdersService,
    @Inject(DoorFilesService) private readonly files: DoorFilesService,
    @Inject(InvoiceDraftService)
    private readonly invoiceDrafts: InvoiceDraftService,
  ) {}
  @Get("catalog")
  @RequirePermission("catalog.read")
  @ApiOkResponse(doorResponses.catalog)
  async listCatalog() {
    return { data: await this.catalog.catalog(true) };
  }
  @Put("models")
  @RequirePermission("catalog.write")
  @ApiBody({ type: DoorModelWriteDto })
  @ApiOkResponse(response)
  async model(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Body(validate(DoorModelWriteDto)) input: DoorModelWriteDto,
  ) {
    return {
      data: {
        id: await this.catalog.writeModel(p.userId, getRequestId(), input),
      },
    };
  }
  @Put("materials")
  @RequirePermission("pricing.write")
  @ApiBody({ type: DoorMaterialWriteDto })
  @ApiOkResponse(response)
  async material(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Body(validate(DoorMaterialWriteDto)) input: DoorMaterialWriteDto,
  ) {
    return {
      data: {
        id: await this.catalog.writeMaterial(p.userId, getRequestId(), input),
      },
    };
  }
  @Put("visibility")
  @RequirePermission("settings.manage")
  @ApiBody({ type: DoorVisibilityDto })
  @ApiOkResponse(doorResponses.visibility)
  async visibility(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Body(validate(DoorVisibilityDto)) input: DoorVisibilityDto,
  ) {
    await this.catalog.visibility(
      p.userId,
      getRequestId(),
      input.expectedVersion,
      input.enabled,
    );
    return { data: { enabled: input.enabled } };
  }
  @Put("stock-unit")
  @RequirePermission("inventory.adjust")
  @ApiBody({ type: DoorStockUnitDto })
  @ApiOkResponse(response)
  async stockUnit(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Body(validate(DoorStockUnitDto)) input: DoorStockUnitDto,
  ) {
    await this.catalog.stockUnit(
      p.userId,
      getRequestId(),
      input.variantId,
      input.unit,
    );
    return { data: { unit: input.unit } };
  }
  @Get("notification")
  @RequirePermission("settings.manage")
  @ApiOkResponse(response)
  async notificationSettings() {
    return { data: await this.catalog.notificationSettings() };
  }
  @Put("notification")
  @RequirePermission("settings.manage")
  @ApiBody({ type: DoorNotificationDto })
  @ApiOkResponse(response)
  async notification(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Body(validate(DoorNotificationDto)) input: DoorNotificationDto,
  ) {
    await this.catalog.notification(
      p.userId,
      getRequestId(),
      input.expectedVersion,
      input.templateId,
    );
    return { data: await this.catalog.notificationSettings() };
  }
  @Get("history/:type/:id")
  @RequirePermission("pricing.read")
  @ApiOkResponse(response)
  async history(@Param("type") type: string, @Param("id") id: string) {
    return { data: { items: await this.catalog.history(type, id) } };
  }
  @Get("report")
  @RequirePermission("reports.read")
  @ApiOkResponse(doorResponses.report)
  async report() {
    return { data: await this.orders.report() };
  }
  @Get("orders")
  @RequirePermission("orders.read")
  @ApiOkResponse(doorResponses.list)
  async list(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Query(validate(DoorPageDto)) page: DoorPageDto,
  ) {
    return { data: await this.orders.list(actor(p, true), page) };
  }
  @Get("orders/:id")
  @RequirePermission("orders.read")
  @ApiOkResponse(doorResponses.order)
  async detail(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
  ) {
    return { data: { order: await this.orders.detail(actor(p, true), id) } };
  }
  @Get("orders/:id/invoice-addresses")
  @RequirePermission("orders.read")
  @ApiOkResponse(response)
  async invoiceAddresses(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
  ) {
    return {
      data: {
        items: await this.orders.invoiceAddresses(
          actor(p, true, ["customers.read"]),
          id,
        ),
      },
    };
  }
  @Post("orders/:id/invoice-source")
  @HttpCode(200)
  @RequirePermission("orders.manage")
  @ApiHeader(header)
  @ApiBody({ type: DoorInvoiceSourceDto })
  @ApiOkResponse(response)
  async invoiceSource(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorInvoiceSourceDto)) input: DoorInvoiceSourceDto,
  ) {
    const current = actor(p, true, ["invoices.write", "customers.read"]);
    const normalized = normalizeIdempotencyKey(key);
    const order = await this.orders.prepareInvoiceSource(
      current,
      id,
      input.expectedVersion,
      input.addressId,
      normalized,
    );
    const result = await this.invoiceDrafts.fromOrder(
      p.userId,
      getRequestId(),
      id,
      { expectedOrderVersion: order.commerceVersion, note: null },
      normalized,
    );
    return { data: { order, draftId: result.draft.id } };
  }
  @Post("orders/:id/quote")
  @HttpCode(200)
  @RequirePermission("orders.manage")
  @RequireFreshAuthentication("STAFF_MFA")
  @ApiHeader(header)
  @ApiBody({ type: DoorQuoteApprovalDto })
  @ApiOkResponse(doorResponses.order)
  async quote(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorQuoteApprovalDto)) input: DoorQuoteApprovalDto,
  ) {
    return {
      data: {
        order: await this.orders.approveQuote(
          actor(p, true, ["pricing.write"]),
          id,
          input,
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Post("orders/:id/technical")
  @HttpCode(200)
  @RequirePermission("orders.manage")
  @ApiHeader(header)
  @ApiBody({ type: DoorTransitionDto })
  @ApiOkResponse(doorResponses.order)
  async technical(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorTransitionDto)) input: DoorTransitionDto,
  ) {
    return {
      data: {
        order: await this.orders.technical(
          actor(p, true),
          id,
          input.expectedVersion,
          input.reason,
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Post("orders/:id/status")
  @HttpCode(200)
  @RequirePermission("orders.manage")
  @ApiHeader(header)
  @ApiBody({ type: DoorTransitionDto })
  @ApiOkResponse(doorResponses.order)
  async status(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorTransitionDto)) input: DoorTransitionDto,
  ) {
    return {
      data: {
        order: await this.orders.transition(
          actor(p, true),
          id,
          input,
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Post("orders/:id/messages")
  @HttpCode(200)
  @RequirePermission("orders.manage")
  @ApiHeader(header)
  @ApiBody({ type: DoorMessageDto })
  @ApiOkResponse(doorResponses.order)
  async message(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorMessageDto)) input: DoorMessageDto,
  ) {
    return {
      data: {
        order: await this.orders.message(
          actor(p, true),
          id,
          input.message,
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Post("orders/:id/materials/:requirementId/reserve")
  @HttpCode(200)
  @RequirePermission("orders.manage")
  @ApiHeader(header)
  @ApiBody({ type: DoorReserveDto })
  @ApiOkResponse(doorResponses.order)
  async reserve(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Param("requirementId") r: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorReserveDto)) input: DoorReserveDto,
  ) {
    return {
      data: {
        order: await this.orders.reserve(
          actor(p, true, ["inventory.adjust"]),
          id,
          r,
          input,
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Post("orders/:id/materials/:requirementId/consume")
  @HttpCode(200)
  @RequirePermission("orders.manage")
  @ApiHeader(header)
  @ApiBody({ type: DoorTransitionDto })
  @ApiOkResponse(doorResponses.order)
  async consume(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Param("requirementId") r: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorTransitionDto)) input: DoorTransitionDto,
  ) {
    return {
      data: {
        order: await this.orders.materialAction(
          actor(p, true, ["inventory.adjust"]),
          id,
          r,
          "consume",
          input.expectedVersion,
          input.reason,
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Post("orders/:id/materials/:requirementId/release")
  @HttpCode(200)
  @RequirePermission("orders.manage")
  @ApiHeader(header)
  @ApiBody({ type: DoorTransitionDto })
  @ApiOkResponse(doorResponses.order)
  async release(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Param("requirementId") r: string,
    @Headers("idempotency-key") key: string,
    @Body(validate(DoorTransitionDto)) input: DoorTransitionDto,
  ) {
    return {
      data: {
        order: await this.orders.materialAction(
          actor(p, true, ["inventory.adjust"]),
          id,
          r,
          "release",
          input.expectedVersion,
          input.reason,
          normalizeIdempotencyKey(key),
        ),
      },
    };
  }
  @Get("orders/:id/files/:fileId")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("orders.read")
  async file(
    @CurrentPrincipal() p: AuthPrincipalContext,
    @Param("id") id: string,
    @Param("fileId") fileId: string,
  ) {
    return this.files.download(actor(p, true), id, fileId);
  }
}
