-- Preparation only: no activation field, stock/cost rewrite or invented opening data.
CREATE TYPE "InventoryCostMethod" AS ENUM ('FIFO', 'MOVING_WEIGHTED_AVERAGE');
CREATE TABLE "InventoryCostPolicyRevision" (
  "id" TEXT PRIMARY KEY,
  "version" INTEGER NOT NULL,
  "method" "InventoryCostMethod",
  "reason" VARCHAR(500) NOT NULL,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestId" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_cost_policy_bounds" CHECK ("version" > 0 AND length(btrim("reason")) > 0 AND length(btrim("requestId")) > 0 AND "reason" !~ '[[:cntrl:]<>]')
);
CREATE UNIQUE INDEX "InventoryCostPolicyRevision_version_key" ON "InventoryCostPolicyRevision"("version");
CREATE TABLE "InventoryCostPolicyCommand" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "keyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "revisionId" TEXT NOT NULL REFERENCES "InventoryCostPolicyRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_cost_policy_hashes" CHECK ("keyHash" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "InventoryCostPolicyCommand_actorId_keyHash_key" ON "InventoryCostPolicyCommand"("actorId", "keyHash");
CREATE FUNCTION inventory_cost_policy_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Inventory cost policy evidence is immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER inventory_cost_policy_revision_immutable BEFORE UPDATE OR DELETE ON "InventoryCostPolicyRevision"
  FOR EACH ROW EXECUTE FUNCTION inventory_cost_policy_immutable();
CREATE TRIGGER inventory_cost_policy_command_immutable BEFORE UPDATE OR DELETE ON "InventoryCostPolicyCommand"
  FOR EACH ROW EXECUTE FUNCTION inventory_cost_policy_immutable();
CREATE FUNCTION inventory_cost_policy_sequence() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(1768842863, 1668248436);
  IF NEW."version"::bigint <> coalesce((SELECT max("version")::bigint FROM "InventoryCostPolicyRevision"), 0) + 1 THEN
    RAISE EXCEPTION 'Cost policy must append the next version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_cost_policy_sequence_guard BEFORE INSERT ON "InventoryCostPolicyRevision"
  FOR EACH ROW EXECUTE FUNCTION inventory_cost_policy_sequence();
