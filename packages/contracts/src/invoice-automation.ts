import type { ApiSuccess } from './api';

/**
 * Standing authorization to issue and publish store invoices for paid orders
 * without a per-invoice staff command. `version` is 0 until an operator saves
 * once; the default is off. `authorizedById` is the staff user whose enabling
 * decision the automatic invoices are issued under.
 */
export type InvoiceAutomationConfig = {
  enabled: boolean;
  version: number;
  updatedAt: string | null;
  authorizedById: string | null;
  /** Whether an approved, active seller/tax policy exists; nothing is issued without one. */
  policyReady: boolean;
  /** Paid orders that currently have no issued invoice (bounded count). */
  pendingOrders: number;
  /** Issued invoices that are not visible to their customer yet (bounded count). */
  unpublishedInvoices: number;
};
export type InvoiceAutomationUpdate = { expectedVersion: number; enabled: boolean };
export type InvoiceAutomationResponse = ApiSuccess<{ config: InvoiceAutomationConfig }>;
