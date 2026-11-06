import type { AuthUser } from '@/lib/auth/AuthProvider';

const has = (user: AuthUser | null, permission: string) => Boolean(user?.permissions.includes(permission));
export const canReadBlog = (user: AuthUser | null) => has(user, 'blog.read');
export const canWriteBlog = (user: AuthUser | null) => has(user, 'blog.write');
export const canPublishBlog = (user: AuthUser | null) => has(user, 'blog.publish');
