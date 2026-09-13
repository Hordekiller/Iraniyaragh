import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  RbacGrantRoleDto,
  RbacPermissionToggleDto,
  RbacRevokeRoleDto,
  RbacRoleCreateDto,
  RbacRoleUpdateDto,
  RbacStaffDirectoryQueryDto,
} from './rbac-admin.dto';

describe('RbacStaffDirectoryQueryDto', () => {
  it('accepts an empty, cursor-paginated directory query', async () => {
    await expect(validate(plainToInstance(RbacStaffDirectoryQueryDto, {}))).resolves.toHaveLength(0);
  });

  it('accepts a fully populated query', async () => {
    const dto = plainToInstance(RbacStaffDirectoryQueryDto, {
      search: 'ali',
      roleKey: 'system-admin',
      status: 'ACTIVE',
      limit: 50,
      cursor: 'user_9aBcDeF',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an unknown status and an oversized limit', async () => {
    const badStatus = plainToInstance(RbacStaffDirectoryQueryDto, { status: 'ADMIN' });
    const badLimit = plainToInstance(RbacStaffDirectoryQueryDto, { limit: 201 });
    await expect(validate(badStatus)).resolves.not.toHaveLength(0);
    await expect(validate(badLimit)).resolves.not.toHaveLength(0);
  });

  it('rejects non-integer limit values after transformation', async () => {
    const dto = plainToInstance(RbacStaffDirectoryQueryDto, { limit: 'big' });
    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});

describe('RbacRoleCreateDto', () => {
  it('accepts a canonical role key and name', async () => {
    const dto = plainToInstance(RbacRoleCreateDto, {
      key: 'warehouse-manager',
      name: 'Warehouse Manager',
      description: 'Daily stock work.',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects uppercase, space and empty role keys', async () => {
    await expect(validate(plainToInstance(RbacRoleCreateDto, { key: 'Warehouse', name: 'x' }))).resolves.not.toHaveLength(0);
    await expect(validate(plainToInstance(RbacRoleCreateDto, { key: 'warehouse manager', name: 'x' }))).resolves.not.toHaveLength(0);
    await expect(validate(plainToInstance(RbacRoleCreateDto, { key: '', name: 'x' }))).resolves.not.toHaveLength(0);
  });

  it('rejects names with control characters', async () => {
    const dto = plainToInstance(RbacRoleCreateDto, { key: 'role-x', name: 'Bad\u0000Name' });
    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});

describe('RbacRoleUpdateDto', () => {
  it('accepts a partial patch', async () => {
    await expect(validate(plainToInstance(RbacRoleUpdateDto, { name: 'New Name' }))).resolves.toHaveLength(0);
    await expect(validate(plainToInstance(RbacRoleUpdateDto, { isActive: false }))).resolves.toHaveLength(0);
  });

  it('rejects an explicitSignal that is not a boolean', async () => {
    await expect(validate(plainToInstance(RbacRoleUpdateDto, { explicitSignal: 'yes' }))).resolves.not.toHaveLength(0);
  });
});

describe('RbacPermissionToggleDto', () => {
  it('accepts a boolean isActive flag', async () => {
    await expect(validate(plainToInstance(RbacPermissionToggleDto, { isActive: true }))).resolves.toHaveLength(0);
  });

  it('rejects a missing isActive flag', async () => {
    await expect(validate(plainToInstance(RbacPermissionToggleDto, {}))).resolves.not.toHaveLength(0);
  });
});

describe('RbacGrantRoleDto', () => {
  it('accepts roleId with optional expiry and reason', async () => {
    const dto = plainToInstance(RbacGrantRoleDto, {
      roleId: 'role_1',
      expiresAt: '2026-10-13T00:00:00.000Z',
      reason: 'Cover',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a malformed ISO-8601 expiry', async () => {
    const dto = plainToInstance(RbacGrantRoleDto, { roleId: 'role_1', expiresAt: 'tomorrow' });
    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});

describe('RbacRevokeRoleDto', () => {
  it('requires a non-empty revokeReason', async () => {
    await expect(validate(plainToInstance(RbacRevokeRoleDto, { revokeReason: '' }))).resolves.not.toHaveLength(0);
    await expect(validate(plainToInstance(RbacRevokeRoleDto, { revokeReason: 'Cover ended' }))).resolves.toHaveLength(0);
  });
});