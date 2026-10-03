import { Body, Controller, Get, Headers, Put, Patch, Header } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import type { CustomerAccountResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequireLiveSession } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { CustomerAccountAddressesDto, CustomerUpdateDto } from './customers.dto';
import { CustomersService } from './customers.service';
import { customersOpenApi } from './customers.openapi';

/** Customer routes always resolve ownership from the authenticated principal. */
@Controller({ path: 'customers/me', version: '1' })
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

  @Patch()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Update the authenticated customer name fields' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: customersOpenApi.accountUpdate })
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
