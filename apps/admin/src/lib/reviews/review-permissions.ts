import type { AuthUser } from '@/lib/auth/AuthProvider';

const has = (user: AuthUser | null, permission: string) => Boolean(user?.permissions.includes(permission));
export const canReadReviews = (user: AuthUser | null) => has(user, 'reviews.read');
export const canModerateReviews = (user: AuthUser | null) => has(user, 'reviews.moderate');
