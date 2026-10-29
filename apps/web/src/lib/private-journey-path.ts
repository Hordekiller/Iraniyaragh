import { ROUTE_PATHS } from './routes'

const patterns = [
  ROUTE_PATHS.search, ROUTE_PATHS.bestsellers, ROUTE_PATHS.cart, ROUTE_PATHS.checkout,
  ROUTE_PATHS.payment, ROUTE_PATHS.paymentResult, ROUTE_PATHS.paymentReturn,
  ROUTE_PATHS.credit, ROUTE_PATHS.invoices, ROUTE_PATHS.invoice, ROUTE_PATHS.account,
  ROUTE_PATHS.addresses, ROUTE_PATHS.sessions, ROUTE_PATHS.orders, ROUTE_PATHS.order,
]

/** Reject unknown descendants before Next sends a successful client-shell response. */
export function isPrivateJourneyPath(segments: string[]): boolean {
  if (segments.some(segment => !segment || segment.includes('/') || segment.includes('\\'))) return false
  // This also runs in a React Server Component. Keep matching independent of
  // the client router's conditional exports and use the shared route grammar.
  return patterns.some(path => {
    const parts = path.slice(1).split('/')
    return parts.length === segments.length && parts.every((part, index) => part.startsWith(':') || part === segments[index])
  })
}
