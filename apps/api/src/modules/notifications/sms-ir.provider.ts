import type {
  SmsProvider,
  SmsRejectionReason,
  SmsSendRequest,
  SmsSendResult,
} from "./sms-provider";

const SMS_IR_VERIFY_URL = "https://api.sms.ir/v1/send/verify";
const CANONICAL_IRANIAN_MOBILE = /^\+989\d{9}$/u;
const PARAMETER_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
const MAX_PARAMETER_COUNT = 20;
const MAX_PARAMETER_VALUE_LENGTH = 25;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type SmsIrProviderConfig = Readonly<{
  apiKey: string;
  timeoutMs: number;
}>;

type SmsIrEnvelope = Readonly<{
  status?: unknown;
  data?: unknown;
}>;

function rejectionReason(status: number): SmsRejectionReason {
  if (status >= 10 && status <= 12) return "authentication";
  if (status === 13 || status === 14) return "account";
  if (status === 101 || status === 123) return "sender";
  if (status === 102) return "credit";
  if (status === 104 || status === 105 || status === 107) return "destination";
  if (
    status === 103 ||
    status === 106 ||
    status === 108 ||
    status === 110 ||
    status === 114 ||
    status === 116 ||
    status === 117 ||
    status === 118
  )
    return "content";
  if (status === 113 || status === 119) return "template";
  if (status === 109 || status === 111 || status === 112)
    return "invalid_request";
  return "unknown";
}

function parseAcceptedMessageId(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("messageId" in data))
    return null;
  const messageId = (data as { messageId?: unknown }).messageId;
  if (
    (typeof messageId === "number" &&
      Number.isSafeInteger(messageId) &&
      messageId > 0) ||
    (typeof messageId === "string" && /^[1-9]\d*$/u.test(messageId))
  )
    return String(messageId);
  return null;
}

export function toSmsIrMobile(destination: string): string {
  if (!CANONICAL_IRANIAN_MOBILE.test(destination))
    throw new Error("SMS destination must be canonical Iranian E.164.");
  return destination.slice(3);
}

export class SmsIrProvider implements SmsProvider {
  constructor(
    private readonly config: SmsIrProviderConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {
    if (
      config.apiKey.length === 0 ||
      config.apiKey.trim() !== config.apiKey ||
      !Number.isInteger(config.timeoutMs) ||
      config.timeoutMs < 1 ||
      config.timeoutMs > 10_000
    ) {
      throw new Error("SMS.ir provider configuration is invalid.");
    }
  }

  async send(request: SmsSendRequest): Promise<SmsSendResult> {
    let mobile: string;
    try {
      mobile = toSmsIrMobile(request.destination);
    } catch {
      return { status: "rejected", reason: "destination" };
    }
    const parameters = Object.entries(request.parameters);
    if (
      !Number.isSafeInteger(request.templateId) ||
      request.templateId <= 0 ||
      request.correlationId.length === 0 ||
      request.correlationId.length > 128 ||
      parameters.length === 0 ||
      parameters.length > MAX_PARAMETER_COUNT ||
      parameters.some(
        ([name, value]) =>
          !PARAMETER_NAME.test(name) ||
          typeof value !== "string" ||
          value.length === 0 ||
          value.length > MAX_PARAMETER_VALUE_LENGTH,
      )
    ) {
      return { status: "rejected", reason: "invalid_request" };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(SMS_IR_VERIFY_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-api-key": this.config.apiKey,
        },
        body: JSON.stringify({
          mobile,
          templateId: request.templateId,
          parameters: parameters.map(([name, value]) => ({ name, value })),
        }),
        signal: controller.signal,
      });
      if (response.status === 429) return { status: "rate_limited" };
      if (response.status >= 500) return { status: "unavailable" };
      let envelope: SmsIrEnvelope;
      try {
        envelope = (await response.json()) as SmsIrEnvelope;
      } catch {
        if (response.status === 401)
          return { status: "rejected", reason: "authentication" };
        if (response.status >= 400 && response.status < 500)
          return { status: "rejected", reason: "invalid_request" };
        return { status: "unknown_result" };
      }
      if (envelope.status === 1 && response.ok) {
        const providerMessageId = parseAcceptedMessageId(envelope.data);
        return providerMessageId
          ? { status: "accepted", providerMessageId }
          : { status: "unknown_result" };
      }
      if (envelope.status === 0) return { status: "unavailable" };
      if (envelope.status === 20) return { status: "rate_limited" };
      if (typeof envelope.status === "number")
        return { status: "rejected", reason: rejectionReason(envelope.status) };
      if (response.status === 401)
        return { status: "rejected", reason: "authentication" };
      if (response.status >= 400 && response.status < 500)
        return { status: "rejected", reason: "invalid_request" };
      return { status: "unknown_result" };
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      )
        return { status: "unknown_result" };
      return { status: "unavailable" };
    } finally {
      clearTimeout(timeout);
    }
  }
}
