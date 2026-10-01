export type SmsPurpose = "customer_login" | "order_paid" | "shipment_dispatched" | "shipment_delivered";

export const SMS_PROVIDER = Symbol("SMS_PROVIDER");
export const CUSTOMER_OTP_SMS_CONFIG = Symbol("CUSTOMER_OTP_SMS_CONFIG");

export type CustomerOtpSmsConfig = Readonly<{
  templateId: number;
  codeParameterName: string;
}>;

export type SmsSendRequest = Readonly<{
  purpose: SmsPurpose;
  destination: string;
  templateId: number;
  parameters: Readonly<Record<string, string>>;
  correlationId: string;
}>;

export type SmsRejectionReason =
  | "authentication"
  | "account"
  | "sender"
  | "template"
  | "destination"
  | "content"
  | "credit"
  | "invalid_request"
  | "unknown";

/**
 * `disabled` means the transport is switched off for this deployment and no
 * message left the process. It is distinct from `unavailable`, which implies a
 * real dispatch attempt that may have been lost upstream, and distinct from
 * `rejected`, which is a definite "not delivered". Neither `unavailable` nor
 * `disabled` may ever be reported as `accepted`.
 */
export type SmsSendResult =
  | Readonly<{ status: "accepted"; providerMessageId: string }>
  | Readonly<{ status: "rate_limited" }>
  | Readonly<{ status: "rejected"; reason: SmsRejectionReason }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "unknown_result" }>
  | Readonly<{ status: "disabled" }>;

export interface SmsProvider {
  /**
   * Providers dispatch at most once. Callers must never automatically retry an
   * unknown_result because the upstream may have accepted the first request.
   */
  send(request: SmsSendRequest): Promise<SmsSendResult>;
}
