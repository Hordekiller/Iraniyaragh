import { Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { PageQueryDto } from '../../common/dto/pagination.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query() query: PageQueryDto,
  ) {
    const userId = (Array.isArray(headers['x-user-id'])
      ? headers['x-user-id'][0]
      : headers['x-user-id']) as string | undefined;
    return this.orders.list({ userId: userId ?? null }, query.page, query.limit);
  }

  @Get(':orderId')
  detail(@Param('orderId') orderId: string) {
    return this.orders.detail(orderId);
  }

  @Post(':orderId/cancel')
  cancel(@Param('orderId') orderId: string) {
    return this.orders.cancel(orderId);
  }
}
