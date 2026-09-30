/**
 * Central route map for the storefront. Keeping paths as constants avoids
 * typo'd links and makes refactors one-place changes.
 */
export const ROUTES = {
  home: '/',
  category: (slug: string) => `/category/${slug}`,
  product: (slug: string) => `/product/${slug}`,
  search: '/search',
  /** Full category directory: the destination for the header/footer category links. */
  categories: '/categories',
  /** The whole catalog: the destination for the "all products" links. */
  products: '/products',
  /** Sorted by publish date: the public catalog has no sales ranking to serve. */
  newest: '/newest',
  services: '/services',
  cart: '/cart',
  checkout: '/checkout',
  terms: '/terms',
  privacy: '/privacy',
  account: '/account',
  orders: '/orders',
  order: (id: string) => `/orders/${id}`,
  payment: (id: string) => `/payment/${id}`,
} as const

/** Route path patterns for react-router `<Route path>` definitions. */
export const ROUTE_PATHS = {
  home: '/',
  category: '/category/:slug',
  product: '/product/:slug',
  search: '/search',
  /** Full category directory: the destination for the header/footer category links. */
  categories: '/categories',
  /** The whole catalog: the destination for the "all products" links. */
  products: '/products',
  /** Sorted by publish date: the public catalog has no sales ranking to serve. */
  newest: '/newest',
  services: '/services',
  cart: '/cart',
  checkout: '/checkout',
  terms: '/terms',
  privacy: '/privacy',
  account: '/account',
  orders: '/orders',
  order: '/orders/:id',
  payment: '/payment/:id',
} as const
