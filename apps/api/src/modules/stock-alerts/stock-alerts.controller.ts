import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { AlertIdentity, StockAlertsService } from './stock-alerts.service';

function identity(headers: Record<string, string | string[] | undefined>): AlertIdentity {
  const userId = (Array.isArray(headers['x-user-id']) ? headers['x-user-id'][0] : headers['x-user-id']) as
    | string
    | undefined;
  const guestToken = (Array.isArray(headers['x-guest-token'])
    ? headers['x-guest-token'][0]
    : headers['x-guest-token']) as string | undefined;
  return { userId: userId ?? null, guestToken: guestToken ?? null };
}

@Controller('stock-alerts')
export class StockAlertsController {
  constructor(private readonly alerts: StockAlertsService) {}

  @Post()
  subscribe(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: { skuId: string; channel?: 'SMS' | 'EMAIL' },
  ) {
    return this.alerts.subscribe(identity(headers), body.skuId, body.channel ?? 'SMS');
  }

  @Get()
  list(@Headers() headers: Record<string, string | string[] | undefined>) {
    return this.alerts.list(identity(headers));
  }

  @Delete(':id')
  cancel(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
  ) {
    return this.alerts.cancel(identity(headers), id);
  }
}
