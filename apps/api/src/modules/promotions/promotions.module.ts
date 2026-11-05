import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CouponRateLimitService } from './coupon-rate-limit.service';
import { PromotionAdminController } from './promotion-admin.controller';
import { PromotionAdminService } from './promotion-admin.service';
import { PromotionPublicController } from './promotion-public.controller';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [PromotionAdminController, PromotionPublicController],
  providers: [PromotionAdminService, CouponRateLimitService],
  exports: [CouponRateLimitService],
})
export class PromotionsModule {}
