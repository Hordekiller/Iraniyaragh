import { Body, Controller, Get, Header, Headers, Inject, Param, Post, Put, Query, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type {
  BlogAdminListResponse, BlogAdminPostResponse, BlogMediaOptionsResponse, BlogPostStatus, BlogPublicListResponse, BlogPublicPostResponse, BlogRevisionsResponse,
} from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { BlogService } from './blog.service';

const ID = /^[A-Za-z0-9_-]{1,64}$/u;
const pipe = (expectedType: new () => object) => new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });

class SourceDto {
  @IsString() @MaxLength(200) title!: string;
  @IsString() @MaxLength(500) url!: string;
  @IsString() @MaxLength(10) accessedAt!: string;
}
class PostDto {
  @IsString() @MaxLength(250) slug!: string;
  @IsString() @MaxLength(160) title!: string;
  @IsString() @MaxLength(400) excerpt!: string;
  @IsString() @MaxLength(200_000) bodyHtml!: string;
  @IsOptional() @IsString() @MaxLength(128) coverMediaId!: string | null;
  @IsOptional() @IsString() @MaxLength(200) coverAlt!: string | null;
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(80, { each: true }) tags!: string[];
  @IsOptional() @IsString() @MaxLength(70) seoTitle!: string | null;
  @IsOptional() @IsString() @MaxLength(200) seoDescription!: string | null;
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SourceDto) sources!: SourceDto[];
}
class UpdateDto { @IsInt() @Min(1) expectedVersion!: number; @ValidateNested() @Type(() => PostDto) post!: PostDto; }
class TransitionDto {
  @IsIn(['submit', 'return-to-draft', 'publish', 'unpublish', 'archive']) action!: 'submit' | 'return-to-draft' | 'publish' | 'unpublish' | 'archive';
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @MaxLength(40) publishAt?: string | null;
}
class PageQuery { @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100_000) page = 1; }
class AdminListQuery extends PageQuery {
  @IsOptional() @IsIn(['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED']) status?: BlogPostStatus;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
}
class IdParam { @Matches(ID) id!: string; }

@Controller({ path: 'blog', version: '1' })
export class BlogController {
  constructor(@Inject(BlogService) private readonly service: BlogService) {}

  // ── Public ──────────────────────────────────────────────────────────────

  @Get('posts')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  @ApiOperation({ summary: 'List live blog articles, newest first' })
  async list(@Query(pipe(PageQuery)) query: PageQuery): Promise<BlogPublicListResponse> { return { data: await this.service.listPublic(query.page) }; }

  @Get('posts/:slug')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Read one live article, or the slug it moved to' })
  async read(@Param('slug') slug: string): Promise<BlogPublicPostResponse> { return { data: await this.service.getPublic(slug) }; }

  // ── Admin ───────────────────────────────────────────────────────────────

  @Get('admin/posts')
  @ApiBearerAuth('access-token') @RequireAuthentication('STAFF_MFA') @RequirePermission('blog.read') @Header('Cache-Control', 'no-store')
  async adminList(@Query(pipe(AdminListQuery)) query: AdminListQuery): Promise<BlogAdminListResponse> { return { data: await this.service.listAdmin({ page: query.page, status: query.status, q: query.q?.trim() || undefined }) }; }

  @Get('admin/media-options')
  @ApiBearerAuth('access-token') @RequireAuthentication('STAFF_MFA') @RequirePermission('blog.write') @Header('Cache-Control', 'no-store')
  async mediaOptions(): Promise<BlogMediaOptionsResponse> { return { data: { items: await this.service.mediaOptions() } }; }

  @Get('admin/posts/:id')
  @ApiBearerAuth('access-token') @RequireAuthentication('STAFF_MFA') @RequirePermission('blog.read') @Header('Cache-Control', 'no-store')
  async adminRead(@Param(pipe(IdParam)) params: IdParam): Promise<BlogAdminPostResponse> { return { data: { post: await this.service.getAdmin(params.id) } }; }

  @Get('admin/posts/:id/revisions')
  @ApiBearerAuth('access-token') @RequireAuthentication('STAFF_MFA') @RequirePermission('blog.read') @Header('Cache-Control', 'no-store')
  async revisions(@Param(pipe(IdParam)) params: IdParam): Promise<BlogRevisionsResponse> { return { data: { items: await this.service.revisions(params.id) } }; }

  @Post('admin/posts')
  @ApiBearerAuth('access-token') @RequireAuthentication('STAFF_MFA') @RequirePermission('blog.write') @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string | undefined, @Body(pipe(PostDto)) body: PostDto): Promise<BlogAdminPostResponse> {
    return { data: { post: await this.service.create(principal.userId, getRequestId(), body, normalizeIdempotencyKey(key)) } };
  }

  @Put('admin/posts/:id')
  @ApiBearerAuth('access-token') @RequireAuthentication('STAFF_MFA') @RequirePermission('blog.write') @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async update(@CurrentPrincipal() principal: AuthPrincipalContext, @Param(pipe(IdParam)) params: IdParam, @Headers('idempotency-key') key: string | undefined, @Body(pipe(UpdateDto)) body: UpdateDto): Promise<BlogAdminPostResponse> {
    return { data: { post: await this.service.update(principal.userId, principal.permissions, getRequestId(), params.id, body.expectedVersion, body.post, normalizeIdempotencyKey(key)) } };
  }

  @Post('admin/posts/:id/transition')
  @ApiBearerAuth('access-token') @RequireAuthentication('STAFF_MFA') @RequirePermission('blog.write') @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async transition(@CurrentPrincipal() principal: AuthPrincipalContext, @Param(pipe(IdParam)) params: IdParam, @Headers('idempotency-key') key: string | undefined, @Body(pipe(TransitionDto)) body: TransitionDto): Promise<BlogAdminPostResponse> {
    return { data: { post: await this.service.transition(principal.userId, principal.permissions, getRequestId(), params.id, body, normalizeIdempotencyKey(key)) } };
  }
}
