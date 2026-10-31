import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import type {
  AccessPermissionListResponse,
  AccessRoleDetailResponse,
  AccessRoleHistoryResponse,
  AccessRoleListResponse,
  AccessUserListResponse,
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
  AccessMemberAssignDto,
  AccessMemberRevokeDto,
  AccessPermissionsReplaceDto,
  AccessRoleCreateDto,
  AccessRoleHistoryQueryDto,
  AccessRoleUpdateDto,
  AccessUserListQueryDto,
} from './access.dto';
import { accessOpenApi } from './access.openapi';
import { AccessService } from './access.service';

@Controller({ path: 'access/admin', version: '1' })
@RequireAuthentication('STAFF_MFA')
@RequirePermission('roles.manage')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get('roles')
  @ApiOperation({ summary: 'List roles with permission and membership counts' })
  @ApiOkResponse({ schema: accessOpenApi.list })
  @ApiForbiddenResponse({ description: 'Missing roles.manage' })
  async listRoles(): Promise<AccessRoleListResponse> {
    return { data: { items: await this.access.listRoles() } };
  }

  @Get('roles/:id')
  @ApiOperation({ summary: 'Get a role with its permissions, members and version' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ schema: accessOpenApi.roleResponse })
  @ApiNotFoundResponse({ description: 'Role not found' })
  async getRole(@Param('id') id: string): Promise<AccessRoleDetailResponse> {
    return { data: { role: await this.access.getRole(id) } };
  }

  @Get('roles/:id/history')
  @ApiOperation({ summary: 'List access-administration audit events for a role' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'perPage', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: accessOpenApi.history })
  async history(
    @Param('id') id: string,
    @Query() query: AccessRoleHistoryQueryDto,
  ): Promise<AccessRoleHistoryResponse> {
    const { items, total } = await this.access.history(id, query);
    return { data: { items, total } };
  }

  @Get('permissions')
  @ApiOperation({ summary: 'List the canonical permission catalogue' })
  @ApiOkResponse({ schema: accessOpenApi.permissionList })
  async listPermissions(): Promise<AccessPermissionListResponse> {
    return { data: { items: await this.access.listPermissions() } };
  }

  @Get('users')
  @ApiOperation({ summary: 'List staff users that can receive a role' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'perPage', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: accessOpenApi.userList })
  async listUsers(@Query() query: AccessUserListQueryDto): Promise<AccessUserListResponse> {
    const { items, total } = await this.access.listUsers(query);
    const pages = Math.max(1, Math.ceil(total / query.perPage));
    return { data: { items, meta: { page: query.page, perPage: query.perPage, total, pages } } };
  }

  @Post('roles')
  @RequireFreshAuthentication(undefined)
  @ApiOperation({ summary: 'Create a custom role' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: accessOpenApi.create })
  @ApiCreatedResponse({ schema: accessOpenApi.roleResponse })
  @ApiBadRequestResponse({ description: 'Unknown permission or invalid role key' })
  @ApiConflictResponse({ description: 'Role key already exists' })
  @ApiForbiddenResponse({ description: 'Missing roles.manage, stale MFA or privilege escalation' })
  async createRole(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string,
    @Body() input: AccessRoleCreateDto,
  ): Promise<AccessRoleDetailResponse> {
    return { data: { role: await this.access.createRole(input, context(principal, key)) } };
  }

  @Patch('roles/:id')
  @RequireFreshAuthentication(undefined)
  @ApiOperation({ summary: 'Rename, describe or deactivate a role with optimistic concurrency' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: accessOpenApi.update })
  @ApiOkResponse({ schema: accessOpenApi.roleResponse })
  @ApiConflictResponse({ description: 'Version conflict or last-administrator protection' })
  @ApiForbiddenResponse({ description: 'System role protection or privilege escalation' })
  async updateRole(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() input: AccessRoleUpdateDto,
  ): Promise<AccessRoleDetailResponse> {
    return { data: { role: await this.access.updateRole(id, input, context(principal, key)) } };
  }

  @Put('roles/:id/permissions')
  @RequireFreshAuthentication(undefined)
  @ApiOperation({ summary: 'Replace a role permission set' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: accessOpenApi.permissions })
  @ApiOkResponse({ schema: accessOpenApi.roleResponse })
  @ApiConflictResponse({ description: 'Version conflict, last administrator or protected role' })
  @ApiForbiddenResponse({ description: 'Missing roles.manage or privilege escalation' })
  async replacePermissions(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() input: AccessPermissionsReplaceDto,
  ): Promise<AccessRoleDetailResponse> {
    return { data: { role: await this.access.replacePermissions(id, input, context(principal, key)) } };
  }

  @Post('roles/:id/members')
  @RequireFreshAuthentication(undefined)
  @ApiOperation({ summary: 'Assign an active role to an active staff user' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: accessOpenApi.assign })
  @ApiCreatedResponse({ schema: accessOpenApi.roleResponse })
  @ApiBadRequestResponse({ description: 'Inactive user, inactive role, already assigned or invalid expiry' })
  @ApiForbiddenResponse({ description: 'Missing roles.manage or privilege escalation' })
  async assignMember(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() input: AccessMemberAssignDto,
  ): Promise<AccessRoleDetailResponse> {
    return { data: { role: await this.access.assignMember(id, input, context(principal, key)) } };
  }

  @Post('roles/:id/members/:userId/revoke')
  @HttpCode(200)
  @RequireFreshAuthentication(undefined)
  @ApiOperation({ summary: 'Revoke a staff user role assignment' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'userId', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: accessOpenApi.revoke })
  @ApiOkResponse({ schema: accessOpenApi.roleResponse })
  @ApiConflictResponse({ description: 'Version conflict or last-administrator protection' })
  async revokeMember(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() input: AccessMemberRevokeDto,
  ): Promise<AccessRoleDetailResponse> {
    return { data: { role: await this.access.revokeMember(id, userId, input, context(principal, key)) } };
  }
}

function context(principal: AuthPrincipalContext, idempotencyKey: string) {
  return { actorId: principal.userId, requestId: getRequestId() ?? null, idempotencyKey };
}
