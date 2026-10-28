export function GET() { return Response.json({ status: 'ok', service: 'storefront' }, { headers: { 'Cache-Control': 'no-store' } }) }
