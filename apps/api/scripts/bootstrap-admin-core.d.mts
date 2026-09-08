export const RECOVERY_CODE_HASH_CONTEXT: 'recovery-code';
export const SYSTEM_ADMIN_ROLE_KEY: 'system-admin';
export const BOOTSTRAP_REFUSAL: 'BOOTSTRAP_REFUSAL';

export type BootstrapOutcome =
  | { status: 'CREATED'; userId: string; recoveryCodes: string[] }
  | { status: 'BOOTSTRAP_REFUSAL' };

export interface BootstrapAdminOptions {
  prisma: unknown;
  email: string;
  passwordHash: string;
  encryptedSecret: string;
  encryptionKeyVersion: string;
  recoveryCodes: string[];
  hashSecret: string;
  requestId?: string;
  operator?: string;
}

export function createFirstAdministrator(
  options: BootstrapAdminOptions,
): Promise<BootstrapOutcome>;

export function hashValue(
  value: string,
  context: string,
  rootSecret: string,
): string;