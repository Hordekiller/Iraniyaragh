#!/usr/bin/env node
/**
 * Approves the report export capacity singleton for automated tests.
 *
 * The report export surface borrows the ADR-0030 discipline: artifacts are
 * stored only after an operator approves the bounded capacity row, cleanup is
 * the only downward counter movement, and the worker oracle lives on the
 * ReportExportJob rows. Staging and production must use the operator settings
 * API for that approval; this script exists only for the e2e/integration suite
 * and is hard-guarded to a test environment with a `_test` database, so it can
 * never approve capacity for a live sales database.
 *
 * Idempotent: the counters (storedBytes, artifactCount, pendingJobCount) are
 * never reset here — the triggers enforce that only artifact evidence moves
 * them, and re-running only refreshes the approved configuration.
 */
import { PrismaClient } from '@prisma/client';
import { assertSeedEnvironment } from '../prisma/seed-policy.mjs';

const target = assertSeedEnvironment(process.env);
if (target.nodeEnvironment !== 'test') {
  throw new Error('Report export capacity may only be approved for automated tests via this script (NODE_ENV=test).');
}

function positiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

const budgetBytes = positiveInt('E2E_REPORT_EXPORT_BUDGET_BYTES', 32 * 1024 * 1024);
const maxArtifacts = positiveInt('E2E_REPORT_EXPORT_MAX_ARTIFACTS', 20);
const maxPendingJobs = positiveInt('E2E_REPORT_EXPORT_MAX_PENDING_JOBS', 3);
const maxRetentionMs = positiveInt('E2E_REPORT_EXPORT_MAX_RETENTION_MS', 30 * 24 * 60 * 60 * 1000);

const prisma = new PrismaClient();

try {
  await prisma.$transaction(async tx => {
    await tx.reportExportStorageCapacity.upsert({
      where: { id: 'report-export' },
      create: {
        id: 'report-export',
        budgetBytes,
        maxArtifacts,
        maxPendingJobs,
        maxRetentionMs,
        isEnabled: true,
        storedBytes: 0n,
        artifactCount: 0,
        pendingJobCount: 0,
        version: 1,
      },
      update: { budgetBytes, maxArtifacts, maxPendingJobs, maxRetentionMs, isEnabled: true, version: { increment: 1 } },
    });
  });
  console.log(`Report export capacity approved for tests: budget ${budgetBytes} bytes, ${maxArtifacts} artifacts, ${maxPendingJobs} pending jobs, retention ${maxRetentionMs} ms.`);
} finally {
  await prisma.$disconnect();
}
