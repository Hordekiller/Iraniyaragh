import { NextResponse, type NextRequest } from 'next/server'
export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  const privateRoute = /^\/(?:account|cart|checkout|orders|payment|payment-return|search|bestsellers)(?:\/|$)/u.test(request.nextUrl.pathname)
  if (process.env.APP_ENVIRONMENT !== 'production') response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  else if (privateRoute) response.headers.set('X-Robots-Tag', 'noindex, follow')
  return response
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
