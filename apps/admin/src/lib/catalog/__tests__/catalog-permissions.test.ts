import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@/lib/auth/AuthProvider';
import {
  canReadCatalog,
  canWriteCatalog,
  CATALOG_READ,
  CATALOG_WRITE,
  hasPermission,
} from '../catalog-permissions';

const user = (permissions: string[]): AuthUser => ({
  userId: 'u1',
  sessionId: 's1',
  authenticationLevel: 'STAFF_MFA',
  permissions,
});

describe('catalog-permissions', () => {
  it('checks a single permission on the user', () => {
    expect(hasPermission(user([CATALOG_READ]), CATALOG_READ)).toBe(true);
    expect(hasPermission(user([CATALOG_READ]), CATALOG_WRITE)).toBe(false);
    expect(hasPermission(null, CATALOG_READ)).toBe(false);
  });

  it('derives read and write access', () => {
    expect(canReadCatalog(user([CATALOG_READ]))).toBe(true);
    expect(canWriteCatalog(user([CATALOG_READ]))).toBe(false);
    expect(canWriteCatalog(user([CATALOG_READ, CATALOG_WRITE]))).toBe(true);
    expect(canReadCatalog(null)).toBe(false);
    expect(canWriteCatalog(null)).toBe(false);
  });
});