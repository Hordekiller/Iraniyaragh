import type { SmsValidation } from "@iranyaragh/contracts";
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
const MAX_RESPONSE_BYTES = 32 * 1024;

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
  if (status === 104 || status === 105 || status === 107 || status === 115)
    return "destination";
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
    (typeof messageId === "string" &&
      messageId.length <= 128 &&
      /^[1-9]\d*$/u.test(messageId))
  )
    return String(messageId);
  return null;
}

async function readBoundedEnvelope(
  response: Response,
): Promise<SmsIrEnvelope | null> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/u.test(declaredLength) &&
    Number(declaredLength) > MAX_RESPONSE_BYTES
  ) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (response.body === null) return null;

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
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as SmsIrEnvelope)
      : null;
  } catch {
    return null;
  }
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
      [...config.apiKey].some((character) => {
        const point = character.codePointAt(0) ?? 0;
        return /\s/u.test(character) || point <= 31 || point === 127;
      }) ||
      !Number.isInteger(config.timeoutMs) ||
      config.timeoutMs < 1 ||
      config.timeoutMs > 10_000
    ) {
      throw new Error("SMS.ir provider configuration is invalid.");
    }
  }

  async checkHealth(): Promise<SmsValidation> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const result = (
      providerHealth: SmsValidation["providerHealth"],
      errorClass: SmsValidation["errorClass"],
    ): SmsValidation => ({
      checked: true,
      providerHealth,
      errorClass,
      lastCheckedAt: new Date().toISOString(),
    });
    try {
      // The official account-credit endpoint does not dispatch a message.
      const response = await this.fetcher("https://api.sms.ir/v1/credit", {
        method: "GET",
        redirect: "error",
        headers: {
          accept: "application/json",
          "x-api-key": this.config.apiKey,
        },
        signal: controller.signal,
      });
      if ([401, 403, 429].includes(response.status) || response.status >= 500) {
        await response.body?.cancel().catch(() => undefined);
        return result(
          response.status === 429 ? "degraded" : "down",
          response.status === 429
            ? "rate_limit"
            : response.status < 500
              ? "auth"
              : "provider_error",
        );
      }
      const envelope = await readBoundedEnvelope(response);
      if (
        response.ok &&
        envelope?.status === 1 &&
        typeof envelope.data === "number" &&
        Number.isFinite(envelope.data) &&
        envelope.data >= 0
      )
        return result(
          envelope.data > 0 ? "ok" : "degraded",
          envelope.data > 0 ? null : "provider_error",
        );
      if (
        typeof envelope?.status === "number" &&
        rejectionReason(envelope.status) === "authentication"
      )
        return result("down", "auth");
      return result("unknown", "provider_error");
    } catch {
      return result(
        "down",
        controller.signal.aborted ? "timeout" : "provider_error",
      );
    } finally {
      clearTimeout(timeout);
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
        // Never forward the API key or OTP to a redirected origin.
        redirect: "error",
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
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel().catch(() => undefined);
        // A gateway failure can follow an accepted dispatch.
        return {
          status: response.status === 429 ? "rate_limited" : "unknown_result",
        };
      }
      const envelope = await readBoundedEnvelope(response);
      if (envelope === null) {
        if (response.status === 401 || response.status === 403)
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
      if (envelope.status === 1) return { status: "unknown_result" };
      if (envelope.status === 0) return { status: "unknown_result" };
      if (envelope.status === 20) return { status: "rate_limited" };
      if (typeof envelope.status === "number") {
        const reason = rejectionReason(envelope.status);
        return reason === "unknown"
          ? { status: "unknown_result" }
          : { status: "rejected", reason };
      }
      if (response.status === 401 || response.status === 403)
        return { status: "rejected", reason: "authentication" };
      if (response.status >= 400 && response.status < 500)
        return { status: "rejected", reason: "invalid_request" };
      return { status: "unknown_result" };
    } catch {
      // Fetch cannot prove whether a request reached the provider. Network,
      // TLS, redirect, timeout and response-stream errors remain ambiguous.
      return { status: "unknown_result" };
    } finally {
      clearTimeout(timeout);
    }
  }
}
