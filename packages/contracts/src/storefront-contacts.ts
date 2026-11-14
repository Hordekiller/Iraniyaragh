import type { ApiSuccess } from './api';

export type ContactChannel = 'instagram' | 'whatsapp' | 'bale' | 'phone' | 'other';
export type StorefrontContactLink = { id: string; channel: ContactChannel; label: string; value: string };
export type StorefrontContactsPublic = { links: StorefrontContactLink[] };
export type StorefrontContactsAdmin = StorefrontContactsPublic & { version: number; updatedAt: string | null };
export type StorefrontContactsUpdate = { expectedVersion: number; links: StorefrontContactLink[] };
export type StorefrontContactsPublicResponse = ApiSuccess<StorefrontContactsPublic>;
export type StorefrontContactsAdminResponse = ApiSuccess<{ config: StorefrontContactsAdmin }>;
