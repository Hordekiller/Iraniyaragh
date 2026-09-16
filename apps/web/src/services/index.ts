export * from './catalog/types'
export { CatalogFixtureClient } from './catalog/fixtures'
export { CatalogHttpClient } from './catalog/http'
export { CatalogError } from './catalog/errors'

export * from './cart/types'
export { CartController, LocalCartStorage } from './cart/controller'
export type { CartStorage } from './cart/controller'
export { OrderFixture, LocalOrderStore } from './cart/order-fixtures'
export type { OrderStore } from './cart/order-fixtures'

export { NewsletterFixture, isValidNewsletterContact } from './newsletter/newsletter-fixture'
export type { NewsletterPort } from './newsletter/newsletter-fixture'
