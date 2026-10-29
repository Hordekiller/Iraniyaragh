import { matchPath } from 'react-router-dom'
import { ROUTE_PATHS } from './routes'

const patterns = [
  ROUTE_PATHS.search, ROUTE_PATHS.bestsellers, ROUTE_PATHS.cart, ROUTE_PATHS.checkout,
  ROUTE_PATHS.payment, ROUTE_PATHS.paymentResult, ROUTE_PATHS.paymentReturn,
  ROUTE_PATHS.credit, ROUTE_PATHS.invoices, ROUTE_PATHS.invoice, ROUTE_PATHS.account,
  ROUTE_PATHS.addresses, ROUTE_PATHS.sessions, ROUTE_PATHS.orders, ROUTE_PATHS.order,
]

/** Reject unknown descendants before Next sends a successful client-shell response. */
export function isPrivateJourneyPath(segments: string[]): boolean {
  const pathname = `/${segments.join('/')}`
  return patterns.some(path => matchPath({ path, end: true, caseSensitive: true }, pathname) !== null)
}
