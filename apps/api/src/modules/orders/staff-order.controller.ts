import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { StaffOrderCreateResponse, StaffOrderOptionsResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import {
  CurrentPrincipal,
  RequireAuthentication,
  RequirePermission,
} from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { StaffOrderCreateDto } from './staff-order.dto';
import { StaffOrderOptionsQueryDto } from './staff-order-options.dto';
import { staffOrderOpenApi } from './staff-order.openapi';
import { StaffOrderService } from './staff-order.service';

const bodyPipe = new ValidationPipe({
  expectedType: StaffOrderCreateDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const optionsQueryPipe = new ValidationPipe({
  expectedType: StaffOrderOptionsQueryDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@ApiTags('orders')
@ApiBearerAuth('access-token')
@Controller({ path: 'orders/admin', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class StaffOrderController {
  constructor(
    @Inject(StaffOrderService) private readonly staffOrders: StaffOrderService,
  ) {}

  @Get('options')
  @RequirePermission('orders.manage')
  @ApiOperation({
    summary: 'Search the customers and SKUs a staff order can be built from',
  })
  @ApiOkResponse({
    description:
      'Matching active customers or sellable variants. Customer mobiles stay ' +
      'masked and no catalog pricing is disclosed.',
    schema: staffOrderOpenApi.optionsResponse,
  })
  @ApiBadRequestResponse({ description: 'The query was malformed.' })
  @ApiForbiddenResponse({
    description:
      'Authenticated, but the caller lacks the order-management permission or the required authentication level.',
  })
  async options(
    @Query(optionsQueryPipe) query: StaffOrderOptionsQueryDto,
  ): Promise<StaffOrderOptionsResponse> {
    return this.staffOrders.options(query);
  }

  @Post()
  @RequirePermission('orders.manage')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a staff-entered order for an existing customer',
  })
  @ApiBody({ schema: staffOrderOpenApi.createBody })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Opaque retry key, maximum 128 characters. Reuse the same key when ' +
      'retrying after a timeout; the stored response is replayed verbatim.',
  })
  @ApiCreatedResponse({
    description:
      'Reserved pending-payment order priced on the server. When the ' +
      'Idempotency-Key already exists the stored response is replayed ' +
      'verbatim and no additional order or reservation is created.',
    schema: staffOrderOpenApi.createResponse,
  })
  @ApiBadRequestResponse({ description: 'Validation failed.' })
  @ApiForbiddenResponse({
    description:
      'Authenticated, but the caller lacks the order-management permission or the required authentication level.',
  })
  @ApiNotFoundResponse({ description: 'Customer or variant does not exist.' })
  @ApiResponse({ status: 409, description: 'Idempotency, stock or state conflict.' })
  @ApiUnprocessableEntityResponse({
    description:
      'The catalog price is unusable, or the submission asked for a guest order.',
  })
  async create(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string | undefined,
    @Body(bodyPipe) input: StaffOrderCreateDto,
  ): Promise<StaffOrderCreateResponse> {
    return this.staffOrders.create({
      actorId: principal.userId,
      requestId: getRequestId(),
      idempotencyKey: normalizeIdempotencyKey(key),
      payload: input,
    });
  }
}
