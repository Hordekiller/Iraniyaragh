import { applyDecorators, Controller, Get, Headers, Inject, Logger, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { PaymentVerificationResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { openApiPaymentVerification } from './payment-verification.openapi';
import { PaymentVerificationService } from './payment-verification.service';

const VerifyCallbackApi = () =>
  applyDecorators(
    ApiOperation({
      summary:
        'Zarinpal redirect callback — always verified server-side; the callback parameters are never treated as payment proof',
    }),
    ApiQuery({ name: 'Authority', required: true, type: String, description: 'Gateway authority token echoed by the redirect.' }),
    ApiQuery({ name: 'Status', required: false, enum: ['OK', 'NOK'], description: 'Gateway-reported intent, re-verified server-side.' }),
    ApiResponse({
      status: 200,
      description: 'JSON verification outcome for non-browser clients.',
      schema: openApiPaymentVerification.verificationResponse,
    }),
    ApiResponse({ status: 303, description: 'Browser navigation to the configured storefront, without gateway query parameters.' }),
    ApiResponse({ status: 400, schema: openApiPaymentVerification.failures.validation }),
    ApiResponse({ status: 404, schema: openApiPaymentVerification.failures.notFound }),
    ApiResponse({ status: 409, schema: openApiPaymentVerification.failures.conflict }),
    ApiResponse({ status: 503, schema: openApiPaymentVerification.failures.serviceUnavailable }),
  );

@ApiTags('payments')
@Controller({ path: 'payments/zarinpal', version: '1' })
export class ZarinpalCallbackController {
  private readonly logger = new Logger(ZarinpalCallbackController.name);

  constructor(
    @Inject(PaymentVerificationService) private readonly verification: PaymentVerificationService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /** Public route: the buyer's browser is redirected here by the gateway. */
  @Get('callback')
  @VerifyCallbackApi()
  async callback(
    @Query('Authority') authority: string | undefined,
    @Query('Status') status: string | undefined,
    @Headers('accept') accept: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const normalized = status === undefined ? undefined : status.toUpperCase();
    const browserNavigation = accept?.split(',').some((part) => part.trim().startsWith('text/html')) ?? false;
    let verification: PaymentVerificationResponse;
    try {
      verification = await this.verification.verify({
        authority: authority ?? '',
        status: normalized,
        requestId: getRequestId(),
      });
    } catch (error) {
      if (!browserNavigation) throw error;
      this.logger.warn(`Payment return could not be confirmed; requestId=${getRequestId()}`);
      this.redirectBrowser(response, '/payment-return');
      return;
    }
    if (!browserNavigation) {
      response.setHeader('Cache-Control', 'no-store');
      response.json(verification);
      return;
    }
    this.redirectBrowser(response, `/payment/${encodeURIComponent(verification.data.verification.orderId)}/result`);
  }

  private redirectBrowser(response: Response, path: string): void {
    const origin = this.config.getOrThrow<string>('STOREFRONT_ORIGIN');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.redirect(303, new URL(path, origin).href);
  }
}
