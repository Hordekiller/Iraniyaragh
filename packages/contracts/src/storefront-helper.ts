import type { ApiSuccess } from './api';

/** Public read: whether the interactive customer helper is shown on the storefront. */
export type StorefrontHelperPublicConfig = { enabled: boolean };
/** `version` is 0 until an admin saves once (the default is then "enabled"). */
export type StorefrontHelperAdminConfig = { enabled: boolean; version: number; updatedAt: string | null };
export type StorefrontHelperUpdate = { expectedVersion: number; enabled: boolean };
export type StorefrontHelperPublicResponse = ApiSuccess<StorefrontHelperPublicConfig>;
export type StorefrontHelperAdminResponse = ApiSuccess<{ config: StorefrontHelperAdminConfig }>;
