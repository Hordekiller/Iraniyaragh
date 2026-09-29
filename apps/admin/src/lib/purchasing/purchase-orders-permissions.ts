import type { AuthUser } from '@/lib/auth/AuthProvider';

export const canReadPurchaseOrders = (user: AuthUser | null) => Boolean(user?.permissions.includes('purchasing.read'));
export const canManagePurchaseOrders = (user: AuthUser | null) => Boolean(user?.permissions.includes('purchasing.manage'));
export const canApprovePurchaseOrders = (user: AuthUser | null) => Boolean(user?.permissions.includes('purchasing.approve'));
export const canReceivePurchaseOrders = (user: AuthUser | null) => Boolean(user?.permissions.includes('purchasing.receive'));
