import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { getRequestId } from "../../common/request-context";
import { normalizeIdempotencyKey } from "../../common/idempotency-key";
import {
  CurrentPrincipal,
  RequireAuthentication,
  RequirePermission,
} from "../auth/auth.guard";
import type { AuthPrincipalContext } from "../auth/auth-principal.service";
import { FulfillmentCommandService } from "./fulfillment-command.service";
import { openApiFulfillmentCommand } from "./fulfillment-command.openapi";

@ApiTags("fulfillment")
@ApiBearerAuth("access-token")
@Controller({ path: "orders/admin/:id/fulfillment", version: "1" })
export class FulfillmentCommandController {
  constructor(
    @Inject(FulfillmentCommandService)
    private readonly commands: FulfillmentCommandService,
  ) {}

  @Post("start")
  @HttpCode(200)
  @RequireAuthentication("STAFF_MFA")
  @RequirePermission("orders.manage")
  @ApiOperation({
    summary: "Start processing a paid order after stock consumption",
  })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "id", type: String })
  @ApiResponse({ status: 200, schema: openApiFulfillmentCommand.result })
  @ApiResponse({ status: 400, schema: openApiFulfillmentCommand.error })
  @ApiResponse({ status: 401, schema: openApiFulfillmentCommand.error })
  @ApiResponse({ status: 403, schema: openApiFulfillmentCommand.error })
  @ApiResponse({ status: 404, schema: openApiFulfillmentCommand.error })
  @ApiResponse({ status: 409, schema: openApiFulfillmentCommand.error })
  start(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.commands.execute(id, "start", {
      actorId: principal.userId,
      requestId: getRequestId(),
      idempotencyKey: normalizeIdempotencyKey(key),
    });
  }

  @Post("ready")
  @HttpCode(200)
  @RequireAuthentication("STAFF_MFA")
  @RequirePermission("orders.manage")
  @ApiOperation({
    summary: "Mark processing order ready to ship after operator packing",
  })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "id", type: String })
  @ApiResponse({ status: 200, schema: openApiFulfillmentCommand.result })
  @ApiResponse({ status: 400, schema: openApiFulfillmentCommand.error })
  @ApiResponse({ status: 401, schema: openApiFulfillmentCommand.error })
  @ApiResponse({ status: 403, schema: openApiFulfillmentCommand.error })
  @ApiResponse({ status: 404, schema: openApiFulfillmentCommand.error })
  @ApiResponse({ status: 409, schema: openApiFulfillmentCommand.error })
  ready(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.commands.execute(id, "ready", {
      actorId: principal.userId,
      requestId: getRequestId(),
      idempotencyKey: normalizeIdempotencyKey(key),
    });
  }
}
