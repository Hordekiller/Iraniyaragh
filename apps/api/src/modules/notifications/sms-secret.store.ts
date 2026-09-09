export type SmsSecretStatus = Readonly<{
  backend: "environment" | "secret_manager";
  capability: "read_only" | "writable";
  configured: boolean;
}>;

export type SmsSecretMutationResult =
  | Readonly<{ status: "updated" }>
  | Readonly<{ status: "cleared" }>
  | Readonly<{ status: "unsupported_operation" }>;

export interface SmsSecretStore {
  getStatus(): Promise<SmsSecretStatus>;
  resolve(): Promise<string | null>;
  rotate(secret: string): Promise<SmsSecretMutationResult>;
  clear(): Promise<SmsSecretMutationResult>;
}

export const SMS_SECRET_STORE = Symbol("SMS_SECRET_STORE");
