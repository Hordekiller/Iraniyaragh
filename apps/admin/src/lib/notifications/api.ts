import type { InAppNotification, InAppNotificationListResponse, InAppNotificationUnreadResponse } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

const PREFIX = '/notifications/admin';

export const listNotifications = async (cursor?: string, signal?: AbortSignal) =>
  (await apiFetch<InAppNotificationListResponse['data']>(`${PREFIX}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { token: getAccessToken(), signal })).data;
export const readUnreadCount = async (signal?: AbortSignal) =>
  (await apiFetch<InAppNotificationUnreadResponse['data']>(`${PREFIX}/unread-count`, { token: getAccessToken(), signal })).data.unreadCount;
export const setNotificationRead = async (id: string, read: boolean) =>
  (await apiFetch<InAppNotification>(`${PREFIX}/${encodeURIComponent(id)}/${read ? 'read' : 'unread'}`, { token: getAccessToken(), method: 'POST' })).data;
export const markAllNotificationsRead = async () =>
  (await apiFetch<InAppNotificationUnreadResponse['data']>(`${PREFIX}/read-all`, { token: getAccessToken(), method: 'POST' })).data.unreadCount;

/** Only same-site paths are followed. */
export const safeHref = (href: string | null) => (href && href.startsWith('/') && !href.startsWith('//') ? href : null);
