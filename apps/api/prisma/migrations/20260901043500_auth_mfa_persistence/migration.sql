-- Durable authentication evidence is required before refresh/session services can
-- issue a replacement access token. There is no truthful backfill for legacy rows:
-- the runtime has not shipped, so any existing Session indicates unmanaged data and
-- must be investigated/revoked before this forward migration is retried.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Session") THEN
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            MESSAGE = 'Auth MFA migration requires an empty Session table; revoke and remove unmanaged pre-runtime sessions first';
    END IF;
END $$;

-- CreateEnum
CREATE TYPE "AuthenticationLevel" AS ENUM ('CUSTOMER_OTP', 'STAFF_MFA');

-- CreateEnum
CREATE TYPE "MfaChallengePurpose" AS ENUM ('STAFF_SIGN_IN', 'TOTP_ENROLLMENT', 'SENSITIVE_ACTION');

-- AlterTable
ALTER TABLE "Session"
    ADD COLUMN "authenticationLevel" "AuthenticationLevel" NOT NULL,
    ADD COLUMN "authenticatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "MfaChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeTokenHash" VARCHAR(255) NOT NULL,
    "purpose" "MfaChallengePurpose" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "requestId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TotpCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "encryptionKeyVersion" VARCHAR(50) NOT NULL,
    "lastAcceptedStep" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TotpCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "totpCredentialId" TEXT NOT NULL,
    "codeHash" VARCHAR(255) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- Security invariants not representable in Prisma.
ALTER TABLE "Session"
    ADD CONSTRAINT "Session_authentication_evidence_check"
        CHECK (
            "authenticatedAt" <= "createdAt" + INTERVAL '5 minutes'
            AND "authenticatedAt" < "expiresAt"
        );

ALTER TABLE "MfaChallenge"
    ADD CONSTRAINT "MfaChallenge_hash_check"
        CHECK (length("challengeTokenHash") >= 32),
    ADD CONSTRAINT "MfaChallenge_attempts_check"
        CHECK ("maxAttempts" = 5 AND "attempts" >= 0 AND "attempts" <= "maxAttempts"),
    ADD CONSTRAINT "MfaChallenge_timestamp_order_check"
        CHECK (
            "expiresAt" > "createdAt"
            AND ("consumedAt" IS NULL OR "consumedAt" >= "createdAt")
            AND ("invalidatedAt" IS NULL OR "invalidatedAt" >= "createdAt")
        ),
    ADD CONSTRAINT "MfaChallenge_terminal_state_check"
        CHECK (NOT ("consumedAt" IS NOT NULL AND "invalidatedAt" IS NOT NULL)),
    ADD CONSTRAINT "MfaChallenge_request_id_check"
        CHECK ("requestId" IS NULL OR btrim("requestId") <> '');

ALTER TABLE "TotpCredential"
    ADD CONSTRAINT "TotpCredential_secret_envelope_check"
        CHECK (
            length("encryptedSecret") >= 32
            AND "encryptionKeyVersion" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$'
        ),
    ADD CONSTRAINT "TotpCredential_step_check"
        CHECK (
            "lastAcceptedStep" IS NULL
            OR ("lastAcceptedStep" >= 0 AND "confirmedAt" IS NOT NULL)
        ),
    ADD CONSTRAINT "TotpCredential_timestamp_order_check"
        CHECK (
            ("confirmedAt" IS NULL OR "confirmedAt" >= "createdAt")
            AND (
                "disabledAt" IS NULL
                OR (
                    "confirmedAt" IS NOT NULL
                    AND "disabledAt" >= "confirmedAt"
                )
            )
        );

ALTER TABLE "RecoveryCode"
    ADD CONSTRAINT "RecoveryCode_hash_check"
        CHECK (length("codeHash") >= 32),
    ADD CONSTRAINT "RecoveryCode_timestamp_order_check"
        CHECK (
            ("consumedAt" IS NULL OR "consumedAt" >= "createdAt")
            AND ("invalidatedAt" IS NULL OR "invalidatedAt" >= "createdAt")
        ),
    ADD CONSTRAINT "RecoveryCode_terminal_state_check"
        CHECK (NOT ("consumedAt" IS NOT NULL AND "invalidatedAt" IS NOT NULL));

-- CreateIndex
CREATE INDEX "Session_tokenFamilyId_revokedAt_idx" ON "Session"("tokenFamilyId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MfaChallenge_challengeTokenHash_key" ON "MfaChallenge"("challengeTokenHash");

-- CreateIndex
CREATE INDEX "MfaChallenge_userId_purpose_createdAt_idx" ON "MfaChallenge"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "MfaChallenge_expiresAt_consumedAt_invalidatedAt_idx" ON "MfaChallenge"("expiresAt", "consumedAt", "invalidatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TotpCredential_userId_key" ON "TotpCredential"("userId");

-- CreateIndex
CREATE INDEX "TotpCredential_confirmedAt_disabledAt_idx" ON "TotpCredential"("confirmedAt", "disabledAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCode_codeHash_key" ON "RecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "RecoveryCode_totpCredentialId_consumedAt_invalidatedAt_idx" ON "RecoveryCode"("totpCredentialId", "consumedAt", "invalidatedAt");

-- AddForeignKey
ALTER TABLE "MfaChallenge" ADD CONSTRAINT "MfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TotpCredential" ADD CONSTRAINT "TotpCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_totpCredentialId_fkey" FOREIGN KEY ("totpCredentialId") REFERENCES "TotpCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
