import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type {
  AdminOrderDetailResponse,
  AdminOrderListResponse,
  CustomerOrderDetailResponse,
  CustomerOrderListResponse,
} from "@iranyaragh/contracts";
import {
  FULFILLMENT_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from "@iranyaragh/contracts";
import {
  CurrentPrincipal,
  RequireAuthentication,
  RequirePermission,
} from "../auth/auth.guard";
import type { AuthPrincipalContext } from "../auth/auth-principal.service";
import {
  AdminOrderListQueryDto,
  CustomerOrderListQueryDto,
} from "./order-read.dto";
import { openApiOrderRead } from "./order-read.openapi";
import { OrderReadService } from "./order-read.service";

const customerQueryPipe = new ValidationPipe({
  expectedType: CustomerOrderListQueryDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const adminQueryPipe = new ValidationPipe({
  expectedType: AdminOrderListQueryDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@ApiTags("orders")
@ApiBearerAuth("access-token")
@Controller({ path: "orders", version: "1" })
export class OrderReadController {
  constructor(
    @Inject(OrderReadService) private readonly orders: OrderReadService,
  ) {}

  @Get("admin")
  @RequireAuthentication("STAFF_MFA")
  @RequirePermission("orders.read")
  @ApiOperation({ summary: "List the permissioned staff order queue" })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    minimum: 1,
    maximum: 10_000,
  })
  @ApiQuery({
    name: "perPage",
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
  })
  @ApiQuery({ name: "status", required: false, enum: ORDER_STATUSES })
  @ApiQuery({ name: "paymentStatus", required: false, enum: PAYMENT_STATUSES })
  @ApiQuery({
    name: "fulfillmentStatus",
    required: false,
    enum: FULFILLMENT_STATUSES,
  })
  @ApiQuery({
    name: "createdFrom",
    required: false,
    type: String,
    format: "date-time",
  })
  @ApiQuery({
    name: "createdTo",
    required: false,
    type: String,
    format: "date-time",
  })
  @ApiQuery({
    name: "sortBy",
    required: false,
    enum: ["createdAt", "updatedAt", "grandTotal"],
  })
  @ApiQuery({ name: "sortDir", required: false, enum: ["asc", "desc"] })
  @ApiQuery({
    name: "search",
    required: false,
    type: String,
    maxLength: 120,
    description:
      "Case-insensitive order-number search only; PII search is not enabled.",
  })
  @ApiOkResponse({ schema: openApiOrderRead.adminList })
  @ApiResponse({ status: 400, schema: openApiOrderRead.failures.validation })
  @ApiResponse({ status: 401, schema: openApiOrderRead.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiOrderRead.failures.forbidden })
  listAdmin(
    @Query(adminQueryPipe) query: AdminOrderListQueryDto,
  ): Promise<AdminOrderListResponse> {
    return this.orders.listAdminOrders(query);
  }

  @Get("admin/:id")
  @RequireAuthentication("STAFF_MFA")
  @RequirePermission("orders.read")
  @ApiOperation({
    summary: "Read staff-safe order detail and immutable activity",
  })
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ schema: openApiOrderRead.adminDetail })
  @ApiResponse({ status: 401, schema: openApiOrderRead.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiOrderRead.failures.forbidden })
  @ApiResponse({ status: 404, schema: openApiOrderRead.failures.adminNotFound })
  getAdmin(@Param("id") id: string): Promise<AdminOrderDetailResponse> {
    return this.orders.getAdminOrder(id);
  }

  @Get()
  @RequireAuthentication("CUSTOMER_OTP")
  @ApiOperation({ summary: "List orders owned by the authenticated customer" })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    minimum: 1,
    maximum: 10_000,
  })
  @ApiQuery({
    name: "perPage",
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
  })
  @ApiQuery({ name: "status", required: false, enum: ORDER_STATUSES })
  @ApiQuery({ name: "sortDir", required: false, enum: ["asc", "desc"] })
  @ApiOkResponse({ schema: openApiOrderRead.customerList })
  @ApiResponse({ status: 400, schema: openApiOrderRead.failures.validation })
  @ApiResponse({ status: 401, schema: openApiOrderRead.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiOrderRead.failures.forbidden })
  listCustomer(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Query(customerQueryPipe) query: CustomerOrderListQueryDto,
  ): Promise<CustomerOrderListResponse> {
    return this.orders.listCustomerOrders(principal.userId, query);
  }

  @Get(":id")
  @RequireAuthentication("CUSTOMER_OTP")
  @ApiOperation({
    summary: "Read an order owned by the authenticated customer",
  })
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ schema: openApiOrderRead.customerDetail })
  @ApiResponse({ status: 401, schema: openApiOrderRead.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiOrderRead.failures.forbidden })
  @ApiResponse({
    status: 404,
    schema: openApiOrderRead.failures.customerNotFound,
  })
  getCustomer(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param("id") id: string,
  ): Promise<CustomerOrderDetailResponse> {
    return this.orders.getCustomerOrder(principal.userId, id);
  }
}
