export const MAX_CART_LINES = 100;
export const MAX_CART_QUANTITY = 99;
export const CART_REPLAY_TTL_MS = 24 * 60 * 60 * 1000;
export const GUEST_CART_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
export const CART_EXPIRED_CLEANUP_BATCH = 100;
export const CART_SERIALIZABLE_RETRIES = 5;
export const CART_RETRY_BASE_DELAY_MS = 5;

export const CUSTOMER_CART_SCOPES = {
  add: 'cart.add:/api/v1/cart/lines',
  set: 'cart.set:/api/v1/cart/lines/:variantId',
  remove: 'cart.remove:/api/v1/cart/lines/:variantId',
  mergeGuest: 'cart.merge:/api/v1/cart/merge-guest',
} as const;

export const GUEST_CART_SCOPES = {
  add: 'guest-cart.add:/api/v1/guest-cart/lines',
  set: 'guest-cart.set:/api/v1/guest-cart/lines/:variantId',
  remove: 'guest-cart.remove:/api/v1/guest-cart/lines/:variantId',
} as const;
