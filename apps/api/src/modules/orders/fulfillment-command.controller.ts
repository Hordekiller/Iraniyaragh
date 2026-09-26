import {
  applyDecorators,
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

const FulfillmentCommandApi = (summary: string) =>
  applyDecorators(
    HttpCode(200),
    RequireAuthentication("STAFF_MFA"),
    RequirePermission("orders.manage"),
    ApiOperation({ summary }),
    ApiHeader({ name: "Idempotency-Key", required: true }),
    ApiParam({ name: "id", type: String }),
    ApiResponse({ status: 200, schema: openApiFulfillmentCommand.result }),
    ...[400, 401, 403, 404, 409].map((status) =>
      ApiResponse({ status, schema: openApiFulfillmentCommand.error }),
    ),
  );

@ApiTags("fulfillment")
@ApiBearerAuth("access-token")
@Controller({ path: "orders/admin/:id/fulfillment", version: "1" })
export class FulfillmentCommandController {
  constructor(
    @Inject(FulfillmentCommandService)
    private readonly commands: FulfillmentCommandService,
  ) {}

  @Post("start")
  @FulfillmentCommandApi(
    "Start processing a paid order after stock consumption",
  )
  start(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.run("start", principal, id, key);
  }

  @Post("ready")
  @FulfillmentCommandApi(
    "Mark processing order ready to ship after operator packing",
  )
  ready(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.run("ready", principal, id, key);
  }

  private run(
    command: "start" | "ready",
    principal: AuthPrincipalContext,
    id: string,
    key: string | undefined,
  ) {
    return this.commands.execute(id, command, {
      actorId: principal.userId,
      requestId: getRequestId(),
      idempotencyKey: normalizeIdempotencyKey(key),
    });
  }
}
