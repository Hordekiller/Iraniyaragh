import { createCipheriv, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { assertSeedEnvironment } from '../prisma/seed-policy.mjs';
import { createFirstAdministrator } from './bootstrap-admin-core.mjs';

/**
 * Non-interactive first-administrator provisioning for automated tests.
 *
 * The operator bootstrap (`bootstrap-admin.mjs`) is the production path and
 * deliberately requires an interactive TTY, an out-of-band TOTP confirmation
 * and a human-held recovery-code list. An automated test needs the same real
 * credentials (a password hash plus a confirmed TOTP credential) so the suite
 * can exercise the genuine password + TOTP sign-in instead of a side door.
 *
 * This script therefore provisions exactly the same records through the same
 * `createFirstAdministrator` transaction, and is hard-guarded to a test
 * environment and a `_test` database so it can never touch staging or
 * production. It never invents defaults: every credential comes from the
 * environment, so nothing secret is committed.
 */

const RECOVERY_CODE_COUNT = 10;
const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
const ENVELOPE_VERSION = 'v1';

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`${name} is required to provision the automated test administrator.`);
  }
  return value;
}

function decodeKey(value) {
  const key = /^[0-9a-f]{64}$/iu.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64url');
  if (key.length !== 32) throw new Error('AUTH_TOTP_ENCRYPTION_KEY must decode to 32 bytes.');
  return key;
}

function encrypt(secret, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [ENVELOPE_VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join(':');
}

const target = assertSeedEnvironment(process.env);
if (target.nodeEnvironment !== 'test') {
  throw new Error('The automated test administrator may only be provisioned with NODE_ENV=test.');
}

const email = required('E2E_STAFF_EMAIL').trim().toLowerCase();
const password = required('E2E_STAFF_PASSWORD');
const totpSecret = required('E2E_STAFF_TOTP_SECRET');
const hashSecret = required('AUTH_HASH_SECRET');
const encryptionKey = decodeKey(required('AUTH_TOTP_ENCRYPTION_KEY'));

const prisma = new PrismaClient();

try {
  const passwordHash = await argon2.hash(password, { ...ARGON_OPTIONS, raw: false });
  const encryptedSecret = encrypt(totpSecret, encryptionKey);
  const recoveryCodes = Array.from(
    { length: RECOVERY_CODE_COUNT },
    () => `E2E-RECOVERY-${randomBytes(10).toString('base64url').toUpperCase()}`,
  );

  const outcome = await createFirstAdministrator({
    prisma,
    email,
    passwordHash,
    encryptedSecret,
    encryptionKeyVersion: ENVELOPE_VERSION,
    recoveryCodes,
    hashSecret,
    operator: 'automated-test',
  });

  if (outcome.status !== 'CREATED') {
    console.log('An active system administrator already exists; leaving it untouched.');
  } else {
    console.log(`Provisioned automated test administrator ${outcome.userId} with a confirmed TOTP credential.`);
  }
} finally {
  await prisma.$disconnect();
}
