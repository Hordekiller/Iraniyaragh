import { BadRequestException, Body, Controller, Get, Headers, Put, Patch, Header } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { CustomerAccountResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequireLiveSession } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { CustomerAccountAddressesDto, CustomerUpdateDto } from './customers.dto';
import { CustomersService } from './customers.service';
import { customersOpenApi } from './customers.openapi';

/** Customer routes always resolve ownership from the authenticated principal. */
@Controller({ path: 'customers/me', version: '1' })
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing, expired or revoked customer session' })
@ApiForbiddenResponse({ description: 'Customer authentication level required' })
@ApiNotFoundResponse({ description: 'No active account linked to the authenticated customer' })
@RequireAuthentication('CUSTOMER_OTP')
@RequireLiveSession()
export class CustomerSelfController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Get the authenticated customer account and address book' })
  @ApiOkResponse({ schema: customersOpenApi.account })
  async get(@CurrentPrincipal() principal: AuthPrincipalContext): Promise<CustomerAccountResponse> {
    return { data: { account: await this.customers.getOwn(principal.userId) } };
  }

  @Put()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Initialize an empty account for the verified customer; repeat submits return the existing own account' })
  @ApiBody({ required: false, schema: { type: 'object', additionalProperties: false, properties: {} } })
  @ApiOkResponse({ schema: customersOpenApi.account })
  @ApiBadRequestResponse({ description: 'Account ownership and mobile cannot be supplied by the client' })
  @ApiConflictResponse({ description: 'CUSTOMER_ACCOUNT_LINK_REQUIRED: existing commerce profile requires controlled ownership reconciliation' })
  async initialize(@CurrentPrincipal() principal: AuthPrincipalContext, @Body() body?: unknown): Promise<CustomerAccountResponse> {
    if (body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Account initialization accepts no client-supplied fields.' });
    }
    return { data: { account: await this.customers.initializeOwn(principal.userId, getRequestId()) } };
  }

  @Patch()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Update the authenticated customer name fields' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: customersOpenApi.accountUpdate })
  @ApiBadRequestResponse({ description: 'Invalid profile fields or idempotency key' })
  @ApiConflictResponse({ description: 'Version conflict or idempotency key payload mismatch' })
  @ApiOkResponse({ schema: customersOpenApi.account })
  async update(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string,
    @Body() input: CustomerUpdateDto,
  ): Promise<CustomerAccountResponse> {
    return { data: { account: await this.customers.updateOwn(principal.userId, input, context(principal, key)) } };
  }

  @Put('addresses')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Replace the authenticated customer address book' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: customersOpenApi.accountAddresses })
  @ApiBadRequestResponse({ description: 'Invalid address book, default address or idempotency key' })
  @ApiConflictResponse({ description: 'Version conflict or idempotency key payload mismatch' })
  @ApiOkResponse({ schema: customersOpenApi.account })
  async replaceAddresses(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string,
    @Body() input: CustomerAccountAddressesDto,
  ): Promise<CustomerAccountResponse> {
    return { data: { account: await this.customers.replaceOwnAddresses(principal.userId, input, context(principal, key)) } };
  }
}

function context(principal: AuthPrincipalContext, idempotencyKey: string) {
  return { actorId: principal.userId, requestId: getRequestId() ?? null, idempotencyKey };
}
