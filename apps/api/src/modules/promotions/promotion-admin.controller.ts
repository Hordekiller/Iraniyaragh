import { Body, Controller, Get, Headers, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  CouponGenerateRequest,
  CouponGenerateResponse,
  CouponListResponse,
  PromotionInput,
  PromotionListResponse,
  PromotionRedemptionListResponse,
  PromotionReportResponse,
  PromotionResponse,
} from '@iranyaragh/contracts';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { PromotionAdminService } from './promotion-admin.service';

const page = (offset?: string, limit?: string) => ({
  offset: Math.max(0, Math.min(Number.parseInt(offset ?? '0', 10) || 0, 100_000)),
  limit: Math.max(1, Math.min(Number.parseInt(limit ?? '25', 10) || 25, 100)),
});
/** Query values can arrive as arrays or objects; only a bounded string is ever forwarded. */
const str = (value: unknown, max: number): string | undefined => (typeof value === 'string' ? value.slice(0, max) : undefined);
const idem = () => ApiHeader({ name: 'Idempotency-Key', required: true });

@ApiTags('promotions')
@ApiBearerAuth('access-token')
@Controller({ path: 'promotions/admin', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class PromotionAdminController {
  constructor(@Inject(PromotionAdminService) private readonly promotions: PromotionAdminService) {}

  @Get()
  @RequirePermission('promotions.read')
  @ApiOperation({ summary: 'List promotions with state and persisted statistics' })
  @ApiOkResponse({ description: 'Promotion page.' })
  async list(@Query('q') q?: string, @Query('state') state?: string, @Query('mode') mode?: string, @Query('offset') offset?: string, @Query('limit') limit?: string): Promise<PromotionListResponse> {
    return { data: await this.promotions.list({ q: str(q, 80), state: str(state, 32), mode: str(mode, 32), ...page(offset, limit) }) };
  }

  @Get('report')
  @RequirePermission('reports.read')
  @ApiOperation({ summary: 'Per-campaign reserved/paid/refunded/cancelled usage and attributed sales' })
  @ApiOkResponse({ description: 'Campaign report.' })
  async report(): Promise<PromotionReportResponse> {
    return { data: { items: await this.promotions.report() } };
  }

  @Get('redemptions')
  @RequirePermission('reports.read')
  @ApiOperation({ summary: 'Redemption history, filterable by campaign, customer and status' })
  @ApiOkResponse({ description: 'Redemption page.' })
  async redemptions(@Query('promotionId') promotionId?: string, @Query('customerId') customerId?: string, @Query('status') status?: string, @Query('offset') offset?: string, @Query('limit') limit?: string): Promise<PromotionRedemptionListResponse> {
    return { data: await this.promotions.redemptions({ promotionId: str(promotionId, 64), customerId: str(customerId, 64), status: str(status, 32), ...page(offset, limit) }) };
  }

  @Get('coupons/by-promotion/:id')
  @RequirePermission('promotions.read')
  @ApiOperation({ summary: 'List coupon codes of a promotion' })
  @ApiOkResponse({ description: 'Coupon page.' })
  async coupons(@Param('id') id: string, @Query('offset') offset?: string, @Query('limit') limit?: string): Promise<CouponListResponse> {
    const p = page(offset, limit);
    return { data: await this.promotions.listCoupons(id, p.offset, p.limit) };
  }

  @Get(':id')
  @RequirePermission('promotions.read')
  @ApiOperation({ summary: 'Read one promotion' })
  @ApiOkResponse({ description: 'Promotion.' })
  async get(@Param('id') id: string): Promise<PromotionResponse> {
    return { data: { promotion: await this.promotions.get(id) } };
  }

  @Post()
  @RequirePermission('promotions.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @idem()
  @ApiOperation({ summary: 'Create a promotion (idempotent, audited)' })
  async create(@CurrentPrincipal() p: AuthPrincipalContext, @Headers('idempotency-key') key: string | undefined, @Body() body: PromotionInput): Promise<PromotionResponse> {
    return { data: { promotion: await this.promotions.create(p.userId, getRequestId(), body, normalizeIdempotencyKey(key)) } };
  }

  @Put(':id')
  @RequirePermission('promotions.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @idem()
  @ApiOperation({ summary: 'Update a promotion with optimistic versioning' })
  async update(@CurrentPrincipal() p: AuthPrincipalContext, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: { promotion: PromotionInput; expectedVersion: number }): Promise<PromotionResponse> {
    return { data: { promotion: await this.promotions.update(p.userId, getRequestId(), id, body?.promotion, body?.expectedVersion, normalizeIdempotencyKey(key)) } };
  }

  @Put(':id/active')
  @RequirePermission('promotions.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @idem()
  @ApiOperation({ summary: 'Immediately enable or disable a promotion' })
  async setActive(@CurrentPrincipal() p: AuthPrincipalContext, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: { isActive: boolean; expectedVersion: number }): Promise<PromotionResponse> {
    return { data: { promotion: await this.promotions.setActive(p.userId, getRequestId(), id, body?.isActive, body?.expectedVersion, normalizeIdempotencyKey(key)) } };
  }

  @Post(':id/coupons')
  @RequirePermission('promotions.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @idem()
  @ApiOperation({ summary: 'Add an explicit coupon code or generate random codes' })
  async generate(@CurrentPrincipal() p: AuthPrincipalContext, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: CouponGenerateRequest): Promise<CouponGenerateResponse> {
    return { data: { items: await this.promotions.generateCoupons(p.userId, getRequestId(), id, body, normalizeIdempotencyKey(key)) } };
  }

  @Put('coupons/:couponId/active')
  @RequirePermission('promotions.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @idem()
  @ApiOperation({ summary: 'Enable or disable one coupon code' })
  async setCouponActive(@CurrentPrincipal() p: AuthPrincipalContext, @Param('couponId') couponId: string, @Headers('idempotency-key') key: string | undefined, @Body() body: { isActive: boolean }) {
    return { data: { coupon: await this.promotions.setCouponActive(p.userId, getRequestId(), couponId, body?.isActive, normalizeIdempotencyKey(key)) } };
  }
}
