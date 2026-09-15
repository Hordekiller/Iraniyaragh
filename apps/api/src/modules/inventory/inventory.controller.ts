import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { getRequestId } from '../../common/request-context';
import { InventoryService } from './inventory.service';
import { InventoryChangeDto, InventoryMovementQueryDto, InventorySnapshotQueryDto } from './inventory.dto';

@Controller({ path: 'inventory', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('balances')
  @RequirePermission('inventory.read')
  async balances(@Query() query: InventorySnapshotQueryDto) { return this.inventory.getSnapshots(query); }

  @Get('movements')
  @RequirePermission('inventory.read')
  async movements(@Query() query: InventoryMovementQueryDto) { return this.inventory.getMovements(query); }

  @Post('changes')
  @RequirePermission('inventory.adjust')
  async change(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() input: InventoryChangeDto) {
    return this.inventory.changeOnHand({ ...input, idempotencyKey, actorId: principal.userId, requestId: getRequestId() });
  }

}
