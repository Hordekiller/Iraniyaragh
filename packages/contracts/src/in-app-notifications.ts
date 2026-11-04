import type { ApiSuccess } from './api';

export type InAppNotificationAudience = 'CUSTOMER' | 'STAFF';
export type InAppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** Same-site path to the related record, or null. */
  href: string | null;
  read: boolean;
  createdAt: string;
};
export type InAppNotificationList = { items: InAppNotification[]; unreadCount: number; nextCursor: string | null };
export type InAppNotificationListResponse = ApiSuccess<InAppNotificationList>;
export type InAppNotificationUnreadResponse = ApiSuccess<{ unreadCount: number }>;
