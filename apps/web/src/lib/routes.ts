/**
 * Central route map for the storefront. Keeping paths as constants avoids
 * typo'd links and makes refactors one-place changes.
 */
export const ROUTES = {
  home: '/',
  categories: '/categories',
  privacy: '/policies/privacy',
  terms: '/policies/terms',
  category: (slug: string) => `/categories/${slug}`,
  product: (slug: string) => `/products/${slug}`,
  search: '/search',
  bestsellers: '/bestsellers',
  cart: '/cart',
  checkout: '/checkout',
  account: '/account',
  orders: '/orders',
  addresses: '/account/addresses',
  sessions: '/account/security',
  credit: '/account/credit',
  invoices: '/account/invoices',
  invoice: (id: string) => `/account/invoices/${encodeURIComponent(id)}`,
  order: (id: string) => `/orders/${id}`,
  payment: (id: string) => `/payment/${id}`,
  paymentResult: (id: string) => `/payment/${id}/result`,
  paymentReturn: '/payment-return',
} as const

/** Route path patterns for react-router `<Route path>` definitions. */
export const ROUTE_PATHS = {
  home: '/',
  categories: '/categories',
  privacy: '/policies/privacy',
  terms: '/policies/terms',
  category: '/categories/:slug',
  product: '/products/:slug',
  search: '/search',
  bestsellers: '/bestsellers',
  cart: '/cart',
  checkout: '/checkout',
  account: '/account',
  orders: '/orders',
  addresses: '/account/addresses',
  sessions: '/account/security',
  credit: '/account/credit',
  invoices: '/account/invoices',
  invoice: '/account/invoices/:id',
  order: '/orders/:id',
  payment: '/payment/:id',
  paymentResult: '/payment/:id/result',
  paymentReturn: '/payment-return',
} as const
