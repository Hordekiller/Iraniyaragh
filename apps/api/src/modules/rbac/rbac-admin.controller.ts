import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  RbacGrantRoleResponse,
  RbacPermissionResponse,
  RbacPermissionsResponse,
  RbacRevokeRoleResponse,
  RbacRoleImpactResponse,
  RbacRoleResponse,
  RbacRolesResponse,
  RbacSoDRestrictionsResponse,
  RbacStaffDetailResponse,
  RbacStaffDirectoryResponse,
} from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import {
  CurrentPrincipal,
  RequireAuthentication,
  RequireFreshAuthentication,
  RequirePermission,
} from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import {
  RbacGrantRoleDto,
  RbacPermissionPathDto,
  RbacPermissionToggleDto,
  RbacRevokeRoleDto,
  RbacRevokeRolePathDto,
  RbacRoleCreateDto,
  RbacRolePathDto,
  RbacRoleUpdateDto,
  RbacStaffDirectoryQueryDto,
  RbacStaffPathDto,
  openApiRbacFailures,
  openApiRbacSchemas,
} from './rbac-admin.dto';
import { RbacAdminService } from './rbac-admin.service';

const rbacFailure = openApiRbacFailures;

@ApiTags('rbac')
@ApiBearerAuth('access-token')
@Controller({ path: 'rbac/admin', version: '1' })
export class RbacAdminController {
  constructor(
    @Inject(RbacAdminService)
    private readonly rbac: RbacAdminService,
  ) {}

  @Get('staff')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'List staff with their active role assignment counts, filtered and cursor-paginated.' })
  @ApiQuery({ name: 'search', required: false, description: 'Free-text search over name, mobile and email.' })
  @ApiQuery({ name: 'roleKey', required: false, description: 'Only staff holding an active grant of this role key.' })
  @ApiQuery({ name: 'status', required: false, description: 'Only staff in this user status.', enum: ['ACTIVE', 'PENDING', 'SUSPENDED', 'LOCKED', 'DELETED'] })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum staff per page.', example: 50 })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor for the next page.' })
  @ApiResponse({ status: 200, schema: openApiRbacSchemas.staffDirectoryResponse, description: 'Staff directory page.' })
  @ApiResponse({ status: 401, schema: rbacFailure.unauthorized, description: rbacFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: rbacFailure.forbidden, description: rbacFailure.forbidden.description })
  listStaff(@Query() query: RbacStaffDirectoryQueryDto): Promise<RbacStaffDirectoryResponse> {
    return this.rbac.listStaff(query);
  }

  @Get('staff/:userId')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Read one staff member with active grants, effective permission keys and details.' })
  @ApiResponse({ status: 200, schema: openApiRbacSchemas.staffDetailResponse, description: 'Staff detail with effective permissions.' })
  @ApiResponse({ status: 401, schema: rbacFailure.unauthorized, description: rbacFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: rbacFailure.forbidden, description: rbacFailure.forbidden.description })
  @ApiResponse({ status: 404, schema: rbacFailure.notFound, description: rbacFailure.notFound.description })
  getStaffDetail(@Param() params: RbacStaffPathDto): Promise<RbacStaffDetailResponse> {
    return this.rbac.getStaffDetail(params.userId);
  }

  @Get('roles')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'List all roles with their granted, active permission keys.' })
  @ApiResponse({ status: 200, schema: openApiRbacSchemas.rolesResponse, description: 'Role registry.' })
  @ApiResponse({ status: 401, schema: rbacFailure.unauthorized, description: rbacFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: rbacFailure.forbidden, description: rbacFailure.forbidden.description })
  listRoles(): Promise<RbacRolesResponse> {
    return this.rbac.listRoles();
  }

  @Get('roles/:roleId')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Read one role with its granted, active permission keys.' })
  @ApiResponse({ status: 200, schema: openApiRbacSchemas.roleResponse, description: 'Single role view.' })
  @ApiResponse({ status: 401, schema: rbacFailure.unauthorized, description: rbacFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: rbacFailure.forbidden, description: rbacFailure.forbidden.description })
  @ApiResponse({ status: 404, schema: rbacFailure.notFound, description: rbacFailure.notFound.description })
  getRole(@Param() params: RbacRolePathDto): Promise<RbacRoleResponse> {
    return this.rbac.getRole(params.roleId);
  }

  @Get('roles/:roleId/impact')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Preview which staff and which effective permissions a role deactivation would change.' })
  @ApiResponse({ status: 200, schema: openApiRbacSchemas.roleImpactResponse, description: 'Deactivation impact preview.' })
  @ApiResponse({ status: 401, schema: rbacFailure.unauthorized, description: rbacFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: rbacFailure.forbidden, description: rbacFailure.forbidden.description })
  @ApiResponse({ status: 404, schema: rbacFailure.notFound, description: rbacFailure.notFound.description })
  previewRoleDeactivation(@Param() params: RbacRolePathDto): Promise<RbacRoleImpactResponse> {
    return this.rbac.previewRoleDeactivation(params.roleId);
  }

  @Post('roles')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('roles.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Create a new custom role with an empty permission set.' })
  @ApiBody({ schema: openApiRbacSchemas.roleCreate })
  @ApiResponse({ status: 201, schema: openApiRbacSchemas.roleResponse, description: 'The created role.' })
  @ApiResponse({ status: 400, schema: rbacFailure.validation, description: rbacFailure.validation.description })
  @ApiResponse({ status: 401, schema: rbacFailure.unauthorized, description: rbacFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: rbacFailure.forbidden, description: rbacFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: rbacFailure.conflict, description: rbacFailure.conflict.description })
  createRole(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() input: RbacRoleCreateDto,
  ): Promise<RbacRoleResponse> {
    return this.rbac.createRole({ actorUserId: principal.userId, requestId: getRequestId() }, input);
  }

  @Patch('roles/:roleId')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('roles.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Rename, describe, activate or deactivate a role; system-role definitions are read-only.' })
  @ApiBody({ schema: openApiRbacSchemas.roleUpdate })
  @ApiResponse({ status: 200, schema: openApiRbacSchemas.roleResponse, description: 'The updated role.' })
  @ApiResponse({ status: 400, schema: rbacFailure.validation, description: rbacFailure.validation.description })
  @ApiResponse({ status: 401, schema: rbacFailure.unauthorized, description: rbacFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: rbacFailure.forbidden, description: rbacFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: rbacFailure.conflict, description: rbacFailure.conflict.description })
  updateRole(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param() params: RbacRolePathDto,
    @Body() input: RbacRoleUpdateDto,
  ): Promise<RbacRoleResponse> {
    return this.rbac.updateRole({ actorUserId: principal.userId, requestId: getRequestId() }, params.roleId, input);
  }

  @Get('permissions')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'List the single, code-owned permission registry.' })
  @ApiResponse({ status: 200, schema: openApiRbacSchemas.permissionsResponse, description: 'The permission registry.' })
  @ApiResponse({ status: 401, schema: rbacFailure.unauthorized, description: rbacFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: rbacFailure.forbidden, description: rbacFailure.forbidden.description })
  listPermissions(): Promise<RbacPermissionsResponse> {
    return this.rbac.listPermissions();
  }

  @Patch('permissions/:permissionId')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('roles.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Enable or disable a permission in the single registry.' })
  @ApiBody({ schema: openApiRbacSchemas.permissionToggle })
  @ApiResponse({ status: 200, schema: openApiRbacSchemas.permissionResponse, description: 'The updated permission.' })
  @ApiResponse({ status: 400, schema: rbacFailure.validation, description: rbacFailure.validation.description })
  @ApiResponse({ status: 401, schema: rbacFailure.unauthorized, description: rbacFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: rbacFailure.forbidden, description: rbacFailure.forbidden.description })
  togglePermission(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param() params: RbacPermissionPathDto,
    @Body() input: RbacPermissionToggleDto,
  ): Promise<RbacPermissionResponse> {
    return this.rbac.togglePermission(
      { actorUserId: principal.userId, requestId: getRequestId() },
      params.permissionId,
      input,
    );
  }

  @Get('sod-restrictions')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'List static separation-of-duty restriction sets.' })
  @ApiResponse({ status: 200, schema: openApiRbacSchemas.sodRestrictionsResponse, description: 'SoD restriction registry.' })
  @ApiResponse({ status: 401, schema: rbacFailure.unauthorized, description: rbacFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: rbacFailure.forbidden, description: rbacFailure.forbidden.description })
  listSoDRestrictions(): Promise<RbacSoDRestrictionsResponse> {
    return this.rbac.listSoDRestrictions();
  }

  @Post('staff/:userId/grants')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('users.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Grant a role to a staff member with an optional expiry and audit reason; idempotent re-grant.' })
  @ApiBody({ schema: openApiRbacSchemas.grantRole })
  @ApiResponse({ status: 201, schema: openApiRbacSchemas.grantRoleResponse, description: 'The role assignment.' })
  @ApiResponse({ status: 400, schema: rbacFailure.validation, description: rbacFailure.validation.description })
  @ApiResponse({ status: 401, schema: rbacFailure.unauthorized, description: rbacFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: rbacFailure.forbidden, description: rbacFailure.forbidden.description })
  @ApiResponse({ status: 404, schema: rbacFailure.notFound, description: rbacFailure.notFound.description })
  @ApiResponse({ status: 409, schema: rbacFailure.conflict, description: rbacFailure.conflict.description })
  grantRole(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param() params: RbacStaffPathDto,
    @Body() input: RbacGrantRoleDto,
  ): Promise<RbacGrantRoleResponse> {
    return this.rbac.grantRole({ actorUserId: principal.userId, requestId: getRequestId() }, params.userId, input);
  }

  @Post('staff/:userId/grants/:roleId/revoke')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('users.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Revoke a role assignment; idempotent and guarded against last-admin demotion.' })
  @ApiBody({ schema: openApiRbacSchemas.revokeRole })
  @ApiResponse({ status: 200, schema: openApiRbacSchemas.revokeRoleResponse, description: 'The assignment after the operation.' })
  @ApiResponse({ status: 400, schema: rbacFailure.validation, description: rbacFailure.validation.description })
  @ApiResponse({ status: 401, schema: rbacFailure.unauthorized, description: rbacFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: rbacFailure.forbidden, description: rbacFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: rbacFailure.conflict, description: rbacFailure.conflict.description })
  revokeRole(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param() params: RbacRevokeRolePathDto,
    @Body() input: RbacRevokeRoleDto,
  ): Promise<RbacRevokeRoleResponse> {
    return this.rbac.revokeRole(
      { actorUserId: principal.userId, requestId: getRequestId() },
      params.userId,
      params.roleId,
      input,
    );
  }
}