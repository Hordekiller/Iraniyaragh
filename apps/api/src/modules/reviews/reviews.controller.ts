import { BadRequestException, Body, Controller, Get, Header, Headers, Inject, Param, Post, Put, Query, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import type {
  AdminReviewListResponse, AdminReviewResponse, OwnReviewResponse, ProductReviewStatus, PublicReviewListResponse, ReviewEligibilityResponse, ReviewSort, ReviewSummariesResponse,
} from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequireLiveSession, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { ReviewsRateLimitService } from './reviews-rate-limit.service';
import { ReviewsService } from './reviews.service';

const ID = /^[A-Za-z0-9_-]{1,64}$/u;
const SLUG = /^[\p{L}\p{N}_-]{1,250}$/u;
const pipe = (expectedType: new () => object) => new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });
// The compiled class declares every optional field as an own `undefined` property, and the global
// pipe hands the route pipe such an instance. An absent filter must stay absent: `Number(undefined)`
// is NaN, which `@IsOptional()` does not skip, and the unfiltered Admin list was rejected with 400.
export const optionalInteger = ({ value }: { value: unknown }): unknown => (value === undefined || value === null ? undefined : Number(value));

class ReviewBody {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(400) title!: string | null;
  @IsString() @MaxLength(4000) body!: string;
}
class UpdateReviewBody extends ReviewBody { @IsInt() @Min(1) expectedVersion!: number; }
class ModerateBody {
  @IsIn(['approve', 'reject', 'hide']) action!: 'approve' | 'reject' | 'hide';
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @MaxLength(1000) note!: string | null;
}
class ReplyBody {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @MaxLength(4000) reply!: string | null;
}
export class PublicQuery {
  @IsOptional() @Transform(optionalInteger) @IsInt() @Min(1) @Max(100_000) page = 1;
  @IsOptional() @IsIn(['newest', 'highest', 'lowest']) sort: ReviewSort = 'newest';
}
export class AdminQuery {
  @IsOptional() @Transform(optionalInteger) @IsInt() @Min(1) @Max(100_000) page = 1;
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN']) status?: ProductReviewStatus;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @Matches(ID) productId?: string;
  @IsOptional() @Transform(optionalInteger) @IsInt() @Min(1) @Max(5) rating?: number;
}
class SlugParam { @Matches(SLUG) slug!: string; }
class IdParam { @Matches(ID) id!: string; }

@Controller({ path: 'reviews', version: '1' })
export class ReviewsController {
  constructor(
    @Inject(ReviewsService) private readonly service: ReviewsService,
    @Inject(ReviewsRateLimitService) private readonly limiter: ReviewsRateLimitService,
  ) {}

  // ── Public ──────────────────────────────────────────────────────────────

  @Get('summaries')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Rating aggregates for up to 100 products (listing cards)' })
  async summaries(@Query('ids') ids?: string): Promise<ReviewSummariesResponse> {
    const list = [...new Set((ids ?? '').split(',').map(id => id.trim()).filter(Boolean))];
    if (list.length === 0 || list.length > 100 || list.some(id => !ID.test(id))) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'ids must be 1 to 100 valid product ids.' });
    return { data: { items: await this.service.summaryItems(list) } };
  }

  @Get('products/:slug')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Approved reviews and rating summary of one product' })
  async list(@Param(pipe(SlugParam)) params: SlugParam, @Query(pipe(PublicQuery)) query: PublicQuery): Promise<PublicReviewListResponse> {
    return { data: await this.service.listPublic(params.slug, query.page, query.sort) };
  }

  // ── Customer (ownership always comes from the session) ────────────────────

  @Get('products/:slug/me')
  @ApiBearerAuth('access-token') @RequireAuthentication('CUSTOMER_OTP') @RequireLiveSession() @Header('Cache-Control', 'no-store') @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Whether the signed-in customer may review this product, and their own review' })
  async eligibility(@CurrentPrincipal() principal: AuthPrincipalContext, @Param(pipe(SlugParam)) params: SlugParam): Promise<ReviewEligibilityResponse> {
    return { data: await this.service.eligibility(principal.userId, params.slug) };
  }

  @Post('products/:slug')
  @ApiBearerAuth('access-token') @RequireAuthentication('CUSTOMER_OTP') @RequireLiveSession() @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Submit a verified-purchase review; it stays private until a moderator approves it' })
  async create(@CurrentPrincipal() principal: AuthPrincipalContext, @Param(pipe(SlugParam)) params: SlugParam, @Headers('idempotency-key') key: string | undefined, @Body(pipe(ReviewBody)) body: ReviewBody): Promise<OwnReviewResponse> {
    await this.limiter.enforceWrite(principal.userId);
    return { data: { review: await this.service.create(principal.userId, getRequestId(), params.slug, body, normalizeIdempotencyKey(key)) } };
  }

  @Put('mine/:id')
  @ApiBearerAuth('access-token') @RequireAuthentication('CUSTOMER_OTP') @RequireLiveSession() @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Edit own review; it returns to moderation' })
  async update(@CurrentPrincipal() principal: AuthPrincipalContext, @Param(pipe(IdParam)) params: IdParam, @Headers('idempotency-key') key: string | undefined, @Body(pipe(UpdateReviewBody)) body: UpdateReviewBody): Promise<OwnReviewResponse> {
    await this.limiter.enforceWrite(principal.userId);
    return { data: { review: await this.service.updateOwn(principal.userId, getRequestId(), params.id, body.expectedVersion, body, normalizeIdempotencyKey(key)) } };
  }

  // ── Staff ───────────────────────────────────────────────────────────────

  @Get('admin')
  @ApiBearerAuth('access-token') @RequireAuthentication('STAFF_MFA') @RequirePermission('reviews.read') @Header('Cache-Control', 'no-store')
  async adminList(@Query(pipe(AdminQuery)) query: AdminQuery): Promise<AdminReviewListResponse> {
    return { data: await this.service.listAdmin({ page: query.page, status: query.status, q: query.q?.trim() || undefined, productId: query.productId, rating: query.rating }) };
  }

  @Get('admin/:id')
  @ApiBearerAuth('access-token') @RequireAuthentication('STAFF_MFA') @RequirePermission('reviews.read') @Header('Cache-Control', 'no-store')
  async adminRead(@Param(pipe(IdParam)) params: IdParam): Promise<AdminReviewResponse> { return { data: { review: await this.service.getAdmin(params.id) } }; }

  @Post('admin/:id/moderate')
  @ApiBearerAuth('access-token') @RequireAuthentication('STAFF_MFA') @RequirePermission('reviews.moderate') @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async moderate(@CurrentPrincipal() principal: AuthPrincipalContext, @Param(pipe(IdParam)) params: IdParam, @Headers('idempotency-key') key: string | undefined, @Body(pipe(ModerateBody)) body: ModerateBody): Promise<AdminReviewResponse> {
    return { data: { review: await this.service.moderate(principal.userId, getRequestId(), params.id, body, normalizeIdempotencyKey(key)) } };
  }

  @Post('admin/:id/reply')
  @ApiBearerAuth('access-token') @RequireAuthentication('STAFF_MFA') @RequirePermission('reviews.moderate') @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async reply(@CurrentPrincipal() principal: AuthPrincipalContext, @Param(pipe(IdParam)) params: IdParam, @Headers('idempotency-key') key: string | undefined, @Body(pipe(ReplyBody)) body: ReplyBody): Promise<AdminReviewResponse> {
    return { data: { review: await this.service.reply(principal.userId, getRequestId(), params.id, body, normalizeIdempotencyKey(key)) } };
  }
}
