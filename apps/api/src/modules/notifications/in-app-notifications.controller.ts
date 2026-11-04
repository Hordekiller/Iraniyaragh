import { Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { InAppNotificationAudience } from '@prisma/client';
import type { InAppNotification, InAppNotificationListResponse, InAppNotificationUnreadResponse } from '@iranyaragh/contracts';
import { CurrentPrincipal, RequireAuthentication } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { InAppNotificationsService } from './in-app-notifications.service';

const ID = /^[A-Za-z0-9_-]{1,64}$/u;
const idOf = (value: string) => (ID.test(value) ? value : '__invalid__');

abstract class BaseController {
  protected abstract readonly audience: InAppNotificationAudience;
  constructor(protected readonly service: InAppNotificationsService) {}

  @Get()
  async list(@CurrentPrincipal() p: AuthPrincipalContext, @Query('cursor') cursor?: string, @Query('unread') unread?: string): Promise<InAppNotificationListResponse> {
    return { data: await this.service.list(p.userId, this.audience, { cursor: cursor?.slice(0, 80), unreadOnly: unread === 'true' }) };
  }

  @Get('unread-count')
  async unreadCount(@CurrentPrincipal() p: AuthPrincipalContext): Promise<InAppNotificationUnreadResponse> {
    return { data: { unreadCount: await this.service.unread(p.userId, this.audience) } };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentPrincipal() p: AuthPrincipalContext): Promise<InAppNotificationUnreadResponse> {
    return { data: { unreadCount: await this.service.markAllRead(p.userId, this.audience) } };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentPrincipal() p: AuthPrincipalContext, @Param('id') id: string): Promise<{ data: InAppNotification }> {
    return { data: await this.service.setRead(p.userId, this.audience, idOf(id), true) };
  }

  @Post(':id/unread')
  @HttpCode(200)
  async unread(@CurrentPrincipal() p: AuthPrincipalContext, @Param('id') id: string): Promise<{ data: InAppNotification }> {
    return { data: await this.service.setRead(p.userId, this.audience, idOf(id), false) };
  }
}

@ApiBearerAuth('access-token')
@RequireAuthentication('CUSTOMER_OTP')
@Controller({ path: 'notifications/me', version: '1' })
export class CustomerNotificationsController extends BaseController {
  protected readonly audience = 'CUSTOMER' as const;
  constructor(@Inject(InAppNotificationsService) service: InAppNotificationsService) { super(service); }
}

@ApiBearerAuth('access-token')
@RequireAuthentication('STAFF_MFA')
@Controller({ path: 'notifications/admin', version: '1' })
export class StaffNotificationsController extends BaseController {
  protected readonly audience = 'STAFF' as const;
  constructor(@Inject(InAppNotificationsService) service: InAppNotificationsService) { super(service); }
}
