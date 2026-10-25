import type { InvoicePdfRequestResponse } from '@iranyaragh/contracts'
import { AuthApiError } from '../auth/errors'
import type { AuthenticatedJsonRequest } from '../../state/auth-context'

const root = (id: string) => `/api/v1/customers/me/invoices/${encodeURIComponent(id)}`

type PdfResult = InvoicePdfRequestResponse['data']['pdf']

/** POST /customers/me/invoices/:id/pdf — one idempotent, capacity-bounded request. */
export function requestCustomerInvoicePdf(
  scoped: AuthenticatedJsonRequest,
  id: string,
  key: string,
): Promise<PdfResult> {
  return scoped<PdfResult>(root(id), {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
  }).then(value => value.data)
}

/** GET /customers/me/invoices/:id/pdf — polling status. */
export function customerInvoicePdfStatus(
  scoped: AuthenticatedJsonRequest,
  id: string,
): Promise<PdfResult> {
  return scoped<PdfResult>(root(id)).then(value => value.data)
}

/** GET artifact — verified bytes; the caller resolves after the digest check. */
export async function downloadCustomerInvoicePdf(
  scoped: AuthenticatedJsonRequest,
  id: string,
  fallbackNumber: string,
) {
  const response = await scoped.response(`${root(id)}/pdf/artifact`)
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = /filename="([^"]+)"/u.exec(disposition)?.[1] ?? 'store-invoice.pdf'
  const serverSha256 = response.headers.get('X-Content-SHA256')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new AuthApiError({ code: 'INTERNAL_ERROR', statusCode: response.status, message: 'The stored invoice document could not be retrieved.' })
  }
  return {
    bytes,
    byteCount: bytes.byteLength,
    serverSha256,
    filename: /^iranyaragh-invoice-.+\.pdf$/u.test(filename) ? filename : `iranyaragh-invoice-${fallbackNumber}.pdf`,
  }
}

export const invoicePdfMissingCodes = new Set(['INVOICE_DOCUMENT_NOT_FOUND', 'INVOICE_PDF_NOT_READY'])
