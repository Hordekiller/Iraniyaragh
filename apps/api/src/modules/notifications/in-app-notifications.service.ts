import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { InAppNotificationAudience, InAppNotification as Row, Prisma } from '@prisma/client';
import type { InAppNotification, InAppNotificationList } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';

const PAGE = 20;
const toDto = (row: Row): InAppNotification => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, href: row.href, read: row.readAt !== null, createdAt: row.createdAt.toISOString() });

/** Every query is scoped by the authenticated userId and audience; ids from other users are indistinguishable from missing. */
@Injectable()
export class InAppNotificationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(userId: string, audience: InAppNotificationAudience, opts: { cursor?: string; unreadOnly?: boolean }): Promise<InAppNotificationList> {
    let cursorWhere: Prisma.InAppNotificationWhereInput = {};
    if (opts.cursor) {
      const [iso, id] = opts.cursor.split('|');
      const at = new Date(iso ?? '');
      if (!id || Number.isNaN(at.getTime())) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'Invalid cursor.' });
      cursorWhere = { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }] };
    }
    const where: Prisma.InAppNotificationWhereInput = { userId, audience, ...(opts.unreadOnly ? { readAt: null } : {}), ...cursorWhere };
    const [rows, unreadCount] = await Promise.all([
      this.prisma.inAppNotification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: PAGE + 1 }),
      this.unread(userId, audience),
    ]);
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return { items: page.map(toDto), unreadCount, nextCursor: rows.length > PAGE && last ? `${last.createdAt.toISOString()}|${last.id}` : null };
  }

  unread(userId: string, audience: InAppNotificationAudience): Promise<number> {
    return this.prisma.inAppNotification.count({ where: { userId, audience, readAt: null } });
  }

  async setRead(userId: string, audience: InAppNotificationAudience, id: string, read: boolean): Promise<InAppNotification> {
    const result = await this.prisma.inAppNotification.updateMany({ where: { id, userId, audience }, data: { readAt: read ? new Date() : null } });
    if (result.count === 0) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notification not found.' });
    const row = await this.prisma.inAppNotification.findFirstOrThrow({ where: { id, userId, audience } });
    return toDto(row);
  }

  async markAllRead(userId: string, audience: InAppNotificationAudience): Promise<number> {
    await this.prisma.inAppNotification.updateMany({ where: { userId, audience, readAt: null }, data: { readAt: new Date() } });
    return this.unread(userId, audience);
  }
}
