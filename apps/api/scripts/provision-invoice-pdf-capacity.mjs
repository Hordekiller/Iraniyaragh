#!/usr/bin/env node
/**
 * Approves the invoice PDF rendering capacity singleton for automated tests.
 *
 * ADR-0030 keeps private invoice PDF rendering operator-gated: the dedicated
 * render worker and the storage budget exist only after a human approves the
 * capacity row. Staging and production must use the operator settings API for
 * that approval; this script exists only for the e2e suite and is hard-guarded
 * to a test environment with a `_test` database, so it can never approve
 * capacity for a live sales database.
 *
 * Idempotent: the counters (storedFiles, storedBytes, pendingJobs) are never
 * reset here — the database trigger enforces that only artifact evidence moves
 * them, and re-running only refreshes the approved configuration.
 */
import { PrismaClient } from '@prisma/client';
import { assertSeedEnvironment } from '../prisma/seed-policy.mjs';

const target = assertSeedEnvironment(process.env);
if (target.nodeEnvironment !== 'test') {
  throw new Error('Invoice PDF capacity may only be approved for automated tests via this script (NODE_ENV=test).');
}

function positiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

const budgetBytes = positiveInt('E2E_INVOICE_PDF_BUDGET_BYTES', 16 * 1024 * 1024);
const maxArtifacts = positiveInt('E2E_INVOICE_PDF_MAX_ARTIFACTS', 20);
const maxPendingJobs = positiveInt('E2E_INVOICE_PDF_MAX_PENDING_JOBS', 3);

const prisma = new PrismaClient();

try {
  await prisma.$transaction(async tx => {
    await tx.invoicePdfStorageCapacity.upsert({
      where: { id: 'invoice-pdf' },
      create: {
        id: 'invoice-pdf',
        budgetBytes,
        maxArtifacts,
        maxPendingJobs,
        isEnabled: true,
        storedBytes: 0n,
        artifactCount: 0,
        pendingJobCount: 0,
        version: 1,
      },
      update: { budgetBytes, maxArtifacts, maxPendingJobs, isEnabled: true, version: { increment: 1 } },
    });
  });
  console.log(`Invoice PDF capacity approved for tests: budget ${budgetBytes} bytes, ${maxArtifacts} artifacts, ${maxPendingJobs} pending jobs.`);
} finally {
  await prisma.$disconnect();
}
