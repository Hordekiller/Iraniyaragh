import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsRateLimitService } from './reviews-rate-limit.service';
import { ReviewsService } from './reviews.service';

@Module({ imports: [AuditModule], controllers: [ReviewsController], providers: [ReviewsService, ReviewsRateLimitService], exports: [ReviewsService] })
export class ReviewsModule {}
