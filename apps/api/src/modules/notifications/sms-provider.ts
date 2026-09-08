export type SmsPurpose = "customer_login";

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

export type SmsSendResult =
  | Readonly<{ status: "accepted"; providerMessageId: string }>
  | Readonly<{ status: "rate_limited" }>
  | Readonly<{ status: "rejected"; reason: SmsRejectionReason }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "unknown_result" }>;

export interface SmsProvider {
  send(request: SmsSendRequest): Promise<SmsSendResult>;
}
