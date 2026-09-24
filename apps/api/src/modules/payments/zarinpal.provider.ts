import type {
  PaymentAuthorizeRequest,
  PaymentAuthorizeResult,
  PaymentGatewayEnvironment,
  PaymentProvider,
  PaymentRejectionReason,
} from './payment-provider.port';

// Zarinpal v4 REST: the payment gateway host differs between environments. The
// live host is used for real transactions only; sandbox never moves money and
// returns sandbox-prefixed authorities (leading "S") for any UUID merchant id.
const SANDBOX_REQUEST_URL = 'https://sandbox.zarinpal.com/pg/v4/payment/request.json';
const LIVE_REQUEST_URL = 'https://payment.zarinpal.com/pg/v4/payment/request.json';
const SANDBOX_REDIRECT_BASE_URL = 'https://sandbox.zarinpal.com/pg/StartPay/';
const LIVE_REDIRECT_BASE_URL = 'https://payment.zarinpal.com/pg/StartPay/';

const MAX_RESPONSE_BYTES = 32 * 1024;
const CONTROL_CHARACTER = /\s/u;

export type ZarinpalGatewayConfig = Readonly<{
  merchantId: string;
  mode: PaymentGatewayEnvironment;
  timeoutMs: number;
  callbackUrl: string;
}>;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type ZarinpalPayload = Readonly<{
  merchant_id: string;
  amount: string;
  currency: 'IRR';
  description: string;
  callback_url: string;
  metadata: Readonly<{ order_id: string }>;
}>;

// Request-phase gateway codes only (documented v4 values). Non-100 codes in the
// request phase are deterministic rejections; codes we cannot attribute are
// reported as `unknown`. NOTE: the same code namespace means different things in
// the verify phase — verify returns 100 once and 101 on every later repeat of an
// already-verified transaction, so the future verification slice must treat
// verify-phase 101 as success, never as `authentication`.
function rejectionReason(code: number): PaymentRejectionReason {
  if (code === 101) return 'authentication';
  if (code === 102) return 'amount';
  if (code >= 10 && code <= 99) return 'invalid_request';
  return 'unknown';
}

function assertValidConfig(config: ZarinpalGatewayConfig): void {
  const invalidCharacters = [...config.merchantId].some((character) =>
    CONTROL_CHARACTER.test(character),
  );
  if (
    config.merchantId.length === 0 ||
    invalidCharacters ||
    !Number.isInteger(config.timeoutMs) ||
    config.timeoutMs < 1
  ) {
    throw new Error('Zarinpal provider configuration is invalid.');
  }
}

function isValidCallableUrl(value: string, environment: PaymentGatewayEnvironment): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (environment === 'live' && url.protocol !== 'https:') return false;
  return url.protocol === 'http:' || url.protocol === 'https:';
}

async function readBoundedBody(response: Response): Promise<unknown> {
  if (response.body === null) return null;
  const declaredLength = response.headers.get('content-length');
  if (
    declaredLength !== null &&
    /^\d+$/u.test(declaredLength) &&
    Number(declaredLength) > MAX_RESPONSE_BYTES
  ) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    return null;
  }
}

function parseAuthority(payload: unknown): { code: number; authority: string | null } {
  if (typeof payload !== 'object' || payload === null) return { code: 0, authority: null };
  const record = payload as Record<string, unknown>;
  const data = (record.data ?? record) as Record<string, unknown> | undefined;
  const authority =
    typeof data?.authority === 'string' && data.authority.length > 0 ? data.authority : null;
  const rawCode = data?.code ?? record.status;
  const code = typeof rawCode === 'number' ? rawCode : 0;
  return { code, authority };
}

export class ZarinpalProvider implements PaymentProvider {
  readonly providerName = 'zarinpal' as const;

  constructor(
    private readonly config: ZarinpalGatewayConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {
    assertValidConfig(config);
    if (!isValidCallableUrl(config.callbackUrl, config.mode)) {
      throw new Error('Zarinpal callback URL must be an absolute http(s) URL.');
    }
  }

  private get requestUrl(): string {
    return this.config.mode === 'live' ? LIVE_REQUEST_URL : SANDBOX_REQUEST_URL;
  }

  private get redirectBaseUrl(): string {
    return this.config.mode === 'live' ? LIVE_REDIRECT_BASE_URL : SANDBOX_REDIRECT_BASE_URL;
  }

  async authorize(request: PaymentAuthorizeRequest): Promise<PaymentAuthorizeResult> {
    if (
      request.amountMinorUnits.length === 0 ||
      !/^[0-9]+$/u.test(request.amountMinorUnits) ||
      request.correlationId.length === 0 ||
      request.correlationId.length > 128 ||
      request.orderId.length === 0 ||
      request.orderNumber.length === 0
    ) {
      return { status: 'rejected', reason: 'invalid_request' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(this.requestUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(this.payload(request) satisfies ZarinpalPayload),
        signal: controller.signal,
      });

      if (response.status === 401) return { status: 'rejected', reason: 'authentication' };
      if (response.status >= 500) return { status: 'unavailable' };

      const body = await readBoundedBody(response);
      if (response.status < 200 || response.status >= 300) {
        return { status: 'rejected', reason: 'invalid_request' };
      }

      const { code, authority } = parseAuthority(body);
      if (code === 100) {
        if (authority === null) return { status: 'unknown_result' };
        return {
          status: 'redirect',
          authority,
          redirectUrl: `${this.redirectBaseUrl}${authority}`,
        };
      }
      if (code !== 0) return { status: 'rejected', reason: rejectionReason(code) };
      return { status: 'unknown_result' };
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        return { status: 'unknown_result' };
      }
      return { status: 'unavailable' };
    } finally {
      clearTimeout(timeout);
    }
  }

  private payload(request: PaymentAuthorizeRequest): ZarinpalPayload {
    return {
      merchant_id: this.config.merchantId,
      amount: request.amountMinorUnits,
      currency: request.currency,
      description: `Iraniyaragh order ${request.orderNumber}`,
      callback_url: request.callbackUrl,
      metadata: {
        order_id: request.orderId,
      },
    };
  }
}