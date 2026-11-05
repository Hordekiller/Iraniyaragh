-- Short-lived sealed successor credentials for idempotent refresh recovery.
CREATE TABLE "RefreshRecovery" (
    "previousSessionId" TEXT NOT NULL,
    "successorSessionId" TEXT NOT NULL,
    "attemptHash" VARCHAR(64) NOT NULL,
    "sealed" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshRecovery_pkey" PRIMARY KEY ("previousSessionId"),
    CONSTRAINT "RefreshRecovery_window_check" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '60 seconds'),
    CONSTRAINT "RefreshRecovery_attempt_hash_check" CHECK (char_length("attemptHash") = 64),
    CONSTRAINT "RefreshRecovery_sealed_check" CHECK (char_length("sealed") BETWEEN 40 AND 2048)
);

CREATE UNIQUE INDEX "RefreshRecovery_successorSessionId_key" ON "RefreshRecovery"("successorSessionId");
CREATE INDEX "RefreshRecovery_expiresAt_idx" ON "RefreshRecovery"("expiresAt");

ALTER TABLE "RefreshRecovery" ADD CONSTRAINT "RefreshRecovery_previousSessionId_fkey" FOREIGN KEY ("previousSessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshRecovery" ADD CONSTRAINT "RefreshRecovery_successorSessionId_fkey" FOREIGN KEY ("successorSessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
