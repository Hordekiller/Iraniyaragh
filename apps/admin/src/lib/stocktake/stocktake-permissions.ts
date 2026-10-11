import type { AuthUser } from '@/lib/auth/AuthProvider';

export const canReadStocktakes = (user: AuthUser | null) => Boolean(user?.permissions.includes('stocktake.read'));
export const canManageStocktakes = (user: AuthUser | null) => Boolean(user?.permissions.includes('stocktake.manage'));
export const canCountStocktakes = (user: AuthUser | null) => Boolean(user?.permissions.includes('stocktake.count'));
export const canApproveStocktakes = (user: AuthUser | null) => Boolean(user?.permissions.includes('stocktake.approve'));
