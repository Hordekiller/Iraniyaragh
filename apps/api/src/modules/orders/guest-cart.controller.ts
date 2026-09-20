import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { CartResponse } from '@iranyaragh/contracts';
import type { Request, Response } from 'express';
import { RateLimitService } from '../auth/rate-limit.service';
import { CartLineDto } from './cart.dto';
import {
  cartIdempotencyHeader,
  normalizeCartIdempotencyKey,
  normalizeCartVariantId,
} from './cart-http';
import { openApiCart } from './cart.openapi';
import {
  GuestCartHttpService,
  type GuestCartCredential,
} from './guest-cart-http.service';
import { GuestCartService } from './guest-cart.service';

@ApiTags('cart')
@Controller({ path: 'guest-cart', version: '1' })
export class GuestCartController {
  constructor(
    private readonly cart: GuestCartService,
    private readonly guestHttp: GuestCartHttpService,
    private readonly rateLimits: RateLimitService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Read and refresh the anonymous server cart' })
  @ApiOkResponse({ schema: openApiCart.response })
  async get(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartResponse> {
    const read = this.guestHttp.read(request);
    const result = await this.cart.getForToken(
      read.credential?.tokenHash ?? null,
    );
    if (
      read.credential &&
      (result.credentialState === 'active' ||
        result.credentialState === 'missing')
    ) {
      this.guestHttp.set(response, read.credential);
    } else if (read.hadCookieMaterial) {
      this.guestHttp.clear(response);
    }
    return result.response;
  }

  @Post('session')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Establish an opaque anonymous Cart session' })
  @ApiNoContentResponse()
  @ApiResponse({ status: 403, schema: openApiCart.failures.csrfForbidden })
  @ApiResponse({ status: 429, schema: openApiCart.failures.rateLimited })
  @ApiResponse({ status: 503, schema: openApiCart.failures.unavailable })
  async createSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.guestHttp.requireBootstrapOrigin(request);
    await this.rateLimits.enforce({
      dimension: 'guest-cart:bootstrap-ip-hour',
      value: requestIp(request),
      context: 'ip',
    });
    const existing = this.guestHttp.read(request).credential;
    this.guestHttp.set(response, existing ?? this.guestHttp.generate());
  }

  @Post('lines')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Add quantity to one anonymous cart line' })
  @ApiHeader(cartIdempotencyHeader())
  @ApiHeader(guestCsrfHeader())
  @ApiBody({ schema: openApiCart.mutationBody })
  @ApiCreatedResponse({ schema: openApiCart.response })
  @ApiResponse({ status: 400, schema: openApiCart.failures.validation })
  @ApiResponse({ status: 403, schema: openApiCart.failures.csrfForbidden })
  @ApiResponse({ status: 404, schema: openApiCart.failures.notFound })
  @ApiResponse({ status: 409, schema: openApiCart.failures.conflict })
  @ApiResponse({ status: 422, schema: openApiCart.failures.unprocessable })
  @ApiResponse({ status: 429, schema: openApiCart.failures.rateLimited })
  @ApiResponse({ status: 503, schema: openApiCart.failures.unavailable })
  async add(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CartLineDto,
  ): Promise<CartResponse> {
    const idempotencyKey = normalizeCartIdempotencyKey(key);
    const current = await this.mutationCredential(request, response);
    const replacements = this.guestHttp.deriveReplacementCredentials(
      current.tokenHash,
    );
    const result = await this.cart.addForToken(
      current.tokenHash,
      replacements.map(({ tokenHash }) => tokenHash),
      body,
      idempotencyKey,
    );
    this.guestHttp.set(
      response,
      chooseCredential(current, replacements, result.replacementTokenHash),
    );
    return result.response;
  }

  @Put('lines/:variantId')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Set one anonymous cart line quantity' })
  @ApiHeader(cartIdempotencyHeader())
  @ApiHeader(guestCsrfHeader())
  @ApiParam({
    name: 'variantId',
    schema: { type: 'string', minLength: 1, maxLength: 191 },
  })
  @ApiBody({ schema: openApiCart.mutationBody })
  @ApiOkResponse({ schema: openApiCart.response })
  @ApiResponse({ status: 400, schema: openApiCart.failures.validation })
  @ApiResponse({ status: 403, schema: openApiCart.failures.csrfForbidden })
  @ApiResponse({ status: 404, schema: openApiCart.failures.notFound })
  @ApiResponse({ status: 409, schema: openApiCart.failures.conflict })
  @ApiResponse({ status: 422, schema: openApiCart.failures.unprocessable })
  @ApiResponse({ status: 429, schema: openApiCart.failures.rateLimited })
  @ApiResponse({ status: 503, schema: openApiCart.failures.unavailable })
  async set(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('idempotency-key') key: string | undefined,
    @Param('variantId') variantId: string,
    @Body() body: CartLineDto,
  ): Promise<CartResponse> {
    const normalizedVariantId = normalizeCartVariantId(variantId);
    if (body.variantId !== normalizedVariantId) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'variantId must match the request path.',
      });
    }
    const idempotencyKey = normalizeCartIdempotencyKey(key);
    const current = await this.mutationCredential(request, response);
    const replacements = this.guestHttp.deriveReplacementCredentials(
      current.tokenHash,
    );
    const result = await this.cart.setForToken(
      current.tokenHash,
      replacements.map(({ tokenHash }) => tokenHash),
      normalizedVariantId,
      body.quantity,
      idempotencyKey,
    );
    this.guestHttp.set(
      response,
      chooseCredential(current, replacements, result.replacementTokenHash),
    );
    return result.response;
  }

  @Delete('lines/:variantId')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Remove one anonymous cart line' })
  @ApiHeader(cartIdempotencyHeader())
  @ApiHeader(guestCsrfHeader())
  @ApiParam({
    name: 'variantId',
    schema: { type: 'string', minLength: 1, maxLength: 191 },
  })
  @ApiOkResponse({ schema: openApiCart.response })
  @ApiResponse({ status: 400, schema: openApiCart.failures.validation })
  @ApiResponse({ status: 403, schema: openApiCart.failures.csrfForbidden })
  @ApiResponse({ status: 409, schema: openApiCart.failures.conflict })
  @ApiResponse({ status: 429, schema: openApiCart.failures.rateLimited })
  @ApiResponse({ status: 503, schema: openApiCart.failures.unavailable })
  async remove(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('idempotency-key') key: string | undefined,
    @Param('variantId') variantId: string,
  ): Promise<CartResponse> {
    const idempotencyKey = normalizeCartIdempotencyKey(key);
    const current = await this.mutationCredential(request, response);
    const replacements = this.guestHttp.deriveReplacementCredentials(
      current.tokenHash,
    );
    const result = await this.cart.removeForToken(
      current.tokenHash,
      replacements.map(({ tokenHash }) => tokenHash),
      normalizeCartVariantId(variantId),
      idempotencyKey,
    );
    this.guestHttp.set(
      response,
      chooseCredential(current, replacements, result.replacementTokenHash),
    );
    return result.response;
  }

  private async mutationCredential(
    request: Request,
    response: Response,
  ): Promise<GuestCartCredential> {
    let credential: GuestCartCredential;
    try {
      credential = this.guestHttp.requireMutationProof(request);
    } catch (error) {
      this.guestHttp.clear(response);
      throw error;
    }
    const ip = requestIp(request);
    await this.rateLimits.enforce({
      dimension: 'guest-cart:ip-minute',
      value: ip,
      context: 'ip',
    });
    await this.rateLimits.enforce({
      dimension: 'guest-cart:ip-hour',
      value: ip,
      context: 'ip',
    });
    return credential;
  }
}

function requestIp(request: Request): string {
  return typeof request.ip === 'string' && request.ip.trim() !== ''
    ? request.ip
    : 'unknown';
}

function chooseCredential(
  current: GuestCartCredential,
  replacements: readonly GuestCartCredential[],
  replacementTokenHash: string | null,
): GuestCartCredential {
  if (replacementTokenHash === null) return current;
  const replacement = replacements.find(
    ({ tokenHash }) => tokenHash === replacementTokenHash,
  );
  if (!replacement) {
    throw new Error('Guest Cart selected an unknown replacement credential.');
  }
  return replacement;
}

function guestCsrfHeader() {
  return {
    name: 'X-CSRF-Token',
    required: true,
    description:
      'Double-submit proof for the guest session established by POST /guest-cart/session.',
    schema: { type: 'string' },
  } as const;
}
