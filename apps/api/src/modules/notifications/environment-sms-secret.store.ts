import type {
  SmsSecretMutationResult,
  SmsSecretStatus,
  SmsSecretStore,
} from "./sms-secret.store";

function validSecret(secret: string | undefined): secret is string {
  return (
    secret !== undefined &&
    secret.length > 0 &&
    secret.trim() === secret &&
    !secret.includes("\0")
  );
}

/**
 * Read-only process-configuration boundary. The value is snapshotted during
 * bootstrap so admin operations can never pretend to mutate process.env.
 */
export class EnvironmentSmsSecretStore implements SmsSecretStore {
  private readonly secret: string | null;

  constructor(secret: string | undefined) {
    this.secret = validSecret(secret) ? secret : null;
  }

  async getStatus(): Promise<SmsSecretStatus> {
    return {
      backend: "environment",
      capability: "read_only",
      configured: this.secret !== null,
    };
  }

  async resolve(): Promise<string | null> {
    return this.secret;
  }

  async rotate(): Promise<SmsSecretMutationResult> {
    return { status: "unsupported_operation" };
  }

  async clear(): Promise<SmsSecretMutationResult> {
    return { status: "unsupported_operation" };
  }
}
