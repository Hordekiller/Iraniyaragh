import { createHmac, hkdfSync } from 'node:crypto';

export const RECOVERY_CODE_HASH_CONTEXT = 'recovery-code';
export const SYSTEM_ADMIN_ROLE_KEY = 'system-admin';

export const BOOTSTRAP_REFUSAL = 'BOOTSTRAP_REFUSAL';

/**
 * Performs the first-administrator creation transaction. It is deliberately
 * free of TTY prompting, password hashing and secret handling so the logic can
 * be exercised under an isolated database (concurrency and failure paths).
 *
 * Concurrency safety: the caller must manage the Prisma transaction; this
 * function runs the advisory-locked transaction itself so concurrent runners
 * serialize and the replace-refusal branch holds.
 */
export async function createFirstAdministrator({ prisma, email, passwordHash, encryptedSecret, encryptionKeyVersion, recoveryCodes, hashSecret, requestId, operator = 'automated-test' }) {
  if (!email || !passwordHash || !encryptedSecret || !Array.isArray(recoveryCodes) || recoveryCodes.length === 0) {
    throw new TypeError('createFirstAdministrator requires email, passwordHash, encryptedSecret and recovery codes.');
  }

  let outcome;
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('iranyaragh:first-admin-bootstrap:v1', 0))`;
    const role = await tx.role.findUnique({ where: { key: SYSTEM_ADMIN_ROLE_KEY }, select: { id: true } });
    if (!role) throw new Error(`The ${SYSTEM_ADMIN_ROLE_KEY} role is missing. Run the approved seed first.`);
    if (await tx.userRole.findFirst({ where: { roleId: role.id, revokedAt: null }, select: { id: true } })) {
      outcome = { status: BOOTSTRAP_REFUSAL };
      return;
    }
    const now = new Date();
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        status: 'ACTIVE',
        isEmailVerified: true,
        emailVerifiedAt: now,
        passwordChangedAt: now,
        createdAt: new Date(now.getTime() - 1_000),
      },
    });
    const credential = await tx.totpCredential.create({
      data: {
        userId: user.id,
        encryptedSecret,
        encryptionKeyVersion,
        confirmedAt: now,
        createdAt: new Date(now.getTime() - 1_000),
      },
    });
    await tx.recoveryCode.createMany({
      data: recoveryCodes.map(code => ({ totpCredentialId: credential.id, codeHash: hashValue(code, RECOVERY_CODE_HASH_CONTEXT, hashSecret) })),
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: 'auth.admin.bootstrapped',
        entityType: 'User',
        entityId: user.id,
        requestId,
        metadata: { roleId: role.id, operator, recoveryCodeCount: recoveryCodes.length },
      },
    });
    outcome = { status: 'CREATED', userId: user.id, recoveryCodes };
  });
  return outcome;
}

export function hashValue(value, context, rootSecret) {
  const derived = Buffer.from(hkdfSync('sha256', Buffer.from(rootSecret), Buffer.from('iranyaragh:auth:hkdf:v1'), Buffer.from(`iranyaragh:auth:${context}`), 32));
  return `v1:${createHmac('sha256', derived).update(value, 'utf8').digest('base64url')}`;
}