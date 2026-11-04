import type { InAppNotification, InAppNotificationListResponse, InAppNotificationUnreadResponse } from '@iranyaragh/contracts'
import type { AuthenticatedJsonRequest } from '../../state/auth-context'

const base = (): { baseUrl?: string; credentials: RequestCredentials } => ({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL, credentials: 'include' })
const PREFIX = '/api/v1/notifications/me'

export function createNotificationsApi(request: AuthenticatedJsonRequest) {
  return {
    async list(cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return (await request<InAppNotificationListResponse['data']>(`${PREFIX}${query}`, base())).data
    },
    async unreadCount() {
      return (await request<InAppNotificationUnreadResponse['data']>(`${PREFIX}/unread-count`, base())).data.unreadCount
    },
    async setRead(id: string, read: boolean) {
      return (await request<InAppNotification>(`${PREFIX}/${encodeURIComponent(id)}/${read ? 'read' : 'unread'}`, { ...base(), method: 'POST' })).data
    },
    async markAllRead() {
      return (await request<InAppNotificationUnreadResponse['data']>(`${PREFIX}/read-all`, { ...base(), method: 'POST' })).data.unreadCount
    },
  }
}
export type NotificationsApi = ReturnType<typeof createNotificationsApi>

/** Only same-site paths are followed; anything else is dropped. */
export const safeNotificationHref = (href: string | null) => (href && href.startsWith('/') && !href.startsWith('//') ? href : null)
