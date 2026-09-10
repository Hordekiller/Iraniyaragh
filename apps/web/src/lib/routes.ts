/**
 * Central route map for the storefront. Keeping paths as constants avoids
 * typo'd links and makes refactors one-place changes.
 */
export const ROUTES = {
  home: '/',
  category: (slug: string) => `/category/${slug}`,
  product: (slug: string) => `/product/${slug}`,
  search: '/search',
  bestsellers: '/bestsellers',
  cart: '/cart',
  checkout: '/checkout',
  account: '/account',
  orders: '/orders',
  order: (id: string) => `/orders/${id}`,
  payment: (id: string) => `/payment/${id}`,
<<<<<<< HEAD
  paymentResult: (id: string) => `/payment/${id}/result`,
  paymentReturn: '/payment-return',
=======
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
} as const

/** Route path patterns for react-router `<Route path>` definitions. */
export const ROUTE_PATHS = {
  home: '/',
  category: '/category/:slug',
  product: '/product/:slug',
  search: '/search',
  bestsellers: '/bestsellers',
  cart: '/cart',
  checkout: '/checkout',
  account: '/account',
  orders: '/orders',
  order: '/orders/:id',
  payment: '/payment/:id',
<<<<<<< HEAD
  paymentResult: '/payment/:id/result',
  paymentReturn: '/payment-return',
=======
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
} as const
