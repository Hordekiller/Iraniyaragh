import { Controller, Post, Query } from '@nestjs/common';
import { PaymentService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentService) {}

  @Post()
  initiate(@Query('orderId') orderId: string) {
    return this.payments.initiate(orderId);
  }

  @Post('verify')
  verify(@Query('authority') authority: string) {
    return this.payments.verify(authority);
  }
}
