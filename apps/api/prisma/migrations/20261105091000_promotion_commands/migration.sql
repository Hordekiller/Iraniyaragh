-- CreateTable
CREATE TABLE "PromotionCommand" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "scope" VARCHAR(64) NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromotionCommand_actorId_scope_keyHash_key" ON "PromotionCommand"("actorId", "scope", "keyHash");

-- AddForeignKey
ALTER TABLE "PromotionCommand" ADD CONSTRAINT "PromotionCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

