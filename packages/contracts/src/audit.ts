export type AuditLogEntry = {
  id: string;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  requestId: string | null;
  ipHash: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type AuditLogListResponse = {
  items: AuditLogEntry[];
  count: number;
};

export type AuditLogFilters = {
  offset?: number;
  limit?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  createdFrom?: string;
  createdToExclusive?: string;
};