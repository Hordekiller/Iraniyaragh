import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { CreditCommandResult, CreditLedgerPage, CreditStatement } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { CreditAdjustmentDto, CreditOpeningDto, CreditPageDto, CreditPolicyDto, CreditReceiptDto, CreditReversalDto } from './credit.dto';
import { creditOpenApi } from './credit.openapi';
import { CreditService, type CreditContext } from './credit.service';

@ApiTags('credit')
@ApiBearerAuth('access-token')
@Controller({ path: 'credit/admin/customers', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class CreditController {
  constructor(private readonly credit: CreditService) {}
  private context(principal: AuthPrincipalContext, key: string): CreditContext {
    return { actorId: principal.userId, requestId: getRequestId(), idempotencyKey: key };
  }

  @Get(':customerId') @RequirePermission('credit.read')
  @ApiOperation({ summary: 'Read a customer credit statement without private receipt evidence' })
  @ApiParam({ name: 'customerId', type: String })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: creditOpenApi.statement })
  statement(@Param('customerId') id: string, @Query() query: CreditPageDto): Promise<CreditStatement> { return this.credit.statement(id, query); }

  @Get(':customerId/ledger') @RequirePermission('credit.read')
  @ApiOperation({ summary: 'Read immutable signed receivable movements' })
  @ApiParam({ name: 'customerId', type: String })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: creditOpenApi.ledger })
  ledger(@Param('customerId') id: string, @Query() query: CreditPageDto): Promise<CreditLedgerPage> { return this.credit.ledger(id, query); }

  @Post(':customerId/policy') @RequirePermission('credit.manage') @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Create or version a customer credit policy; never edit financial balances' })
  @ApiParam({ name: 'customerId', type: String }) @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: creditOpenApi.policy }) @ApiCreatedResponse({ schema: creditOpenApi.result })
  policy(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('customerId') id: string, @Body() input: CreditPolicyDto): Promise<CreditCommandResult> {
    return this.credit.policy(id, input, this.context(principal, key));
  }

  @Post(':customerId/opening') @RequirePermission('credit.opening') @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Record one evidenced historical opening balance; creates no order or payment' })
  @ApiParam({ name: 'customerId', type: String }) @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: creditOpenApi.opening }) @ApiCreatedResponse({ schema: creditOpenApi.result })
  opening(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('customerId') id: string, @Body() input: CreditOpeningDto): Promise<CreditCommandResult> {
    return this.credit.opening(id, input, this.context(principal, key));
  }

  @Post(':customerId/receipts') @RequirePermission('credit.receive') @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Record already-received money allocated exactly to this customer debt' })
  @ApiParam({ name: 'customerId', type: String }) @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: creditOpenApi.receipt }) @ApiCreatedResponse({ schema: creditOpenApi.result })
  receipt(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('customerId') id: string, @Body() input: CreditReceiptDto): Promise<CreditCommandResult> {
    return this.credit.receipt(id, input, this.context(principal, key));
  }

  @Post(':customerId/receipts/:receiptId/reverse') @RequirePermission('credit.adjust') @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Append a whole-receipt reversal retaining the original receipt and evidence' })
  @ApiParam({ name: 'customerId', type: String }) @ApiParam({ name: 'receiptId', type: String }) @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: creditOpenApi.reversal }) @ApiCreatedResponse({ schema: creditOpenApi.result })
  reverseReceipt(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('customerId') id: string, @Param('receiptId') receiptId: string, @Body() input: CreditReversalDto): Promise<CreditCommandResult> {
    return this.credit.reverseReceipt(id, receiptId, input, this.context(principal, key));
  }

  @Post(':customerId/documents/:documentId/adjust') @RequirePermission('credit.adjust') @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Append an evidenced debit adjustment or bounded unpaid credit note' })
  @ApiParam({ name: 'customerId', type: String }) @ApiParam({ name: 'documentId', type: String }) @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: creditOpenApi.adjustment }) @ApiCreatedResponse({ schema: creditOpenApi.result })
  adjust(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('customerId') id: string, @Param('documentId') documentId: string, @Body() input: CreditAdjustmentDto): Promise<CreditCommandResult> {
    return this.credit.adjust(id, documentId, input, this.context(principal, key));
  }
}

@ApiTags('credit')
@ApiBearerAuth('access-token')
@Controller({ path: 'customers/me/credit', version: '1' })
@RequireAuthentication('CUSTOMER_OTP')
export class CustomerCreditController {
  constructor(private readonly credit: CreditService) {}
  @Get()
  @ApiOperation({ summary: 'Read only the authenticated customer receivable statement' })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: { type: 'object', required: ['data'], properties: { data: creditOpenApi.statement } } })
  statement(@CurrentPrincipal() principal: AuthPrincipalContext, @Query() query: CreditPageDto): Promise<{ data: CreditStatement }> {
    return this.credit.customerStatement(principal.userId, query).then(data => ({ data }));
  }
}
