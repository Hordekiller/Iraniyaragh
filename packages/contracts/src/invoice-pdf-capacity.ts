import type { ApiSuccess } from './api';

/**
 * Operator-approved capacity of the private invoice PDF store (ADR-0030).
 * Nothing is rendered or stored until an operator approves a budget; the
 * counters are evidence written only by artifacts and render jobs.
 * `version` is 0 until the first approval.
 */
export type InvoicePdfCapacityConfig = {
  configured: boolean;
  enabled: boolean;
  version: number;
  /** Approved storage budget in whole mebibytes. */
  budgetMegabytes: number;
  maxArtifacts: number;
  maxPendingJobs: number;
  storedBytes: number;
  artifactCount: number;
  pendingJobCount: number;
};
export type InvoicePdfCapacityUpdate = {
  expectedVersion: number;
  enabled: boolean;
  budgetMegabytes: number;
  maxArtifacts: number;
  maxPendingJobs: number;
};
export const INVOICE_PDF_CAPACITY_LIMITS = {
  budgetMegabytes: { min: 1, max: 1024 },
  maxArtifacts: { min: 1, max: 20000 },
  maxPendingJobs: { min: 1, max: 20 },
} as const;
export type InvoicePdfCapacityResponse = ApiSuccess<{ capacity: InvoicePdfCapacityConfig }>;
