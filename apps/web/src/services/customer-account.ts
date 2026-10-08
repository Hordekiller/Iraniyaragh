import type {
  CustomerAccount,
  CustomerAccountAddressesRequest,
  CustomerAccountUpdateRequest,
} from '@iranyaragh/contracts'
import type { AuthenticatedJsonRequest } from '../state/auth-context'
import { AuthApiError } from '../lib/auth/errors'

export async function initializeCustomerAccount(request: AuthenticatedJsonRequest, baseUrl?: string): Promise<CustomerAccount> {
  const response = await request<{ account: CustomerAccount }>('/api/v1/customers/me', {
    method: 'PUT', ...(baseUrl === undefined ? {} : { baseUrl }),
  })
  return response.data.account
}

export async function getCustomerAccount(request: AuthenticatedJsonRequest): Promise<CustomerAccount> {
  const scopedRequest = request.forCurrentPrincipal()
  try {
    const response = await scopedRequest<{ account: CustomerAccount }>('/api/v1/customers/me')
    return response.data.account
  } catch (error) {
    if (!(error instanceof AuthApiError) || error.code !== 'NOT_FOUND' || error.statusCode !== 404) throw error
    return initializeCustomerAccount(scopedRequest)
  }
}

export async function updateCustomerAccount(
  request: AuthenticatedJsonRequest,
  input: CustomerAccountUpdateRequest,
  idempotencyKey: string,
): Promise<CustomerAccount> {
  const response = await request<{ account: CustomerAccount }>('/api/v1/customers/me', {
    method: 'PATCH', json: input, headers: { 'Idempotency-Key': idempotencyKey },
  })
  return response.data.account
}

export async function replaceCustomerAddresses(
  request: AuthenticatedJsonRequest,
  input: CustomerAccountAddressesRequest,
  idempotencyKey: string,
): Promise<CustomerAccount> {
  const response = await request<{ account: CustomerAccount }>('/api/v1/customers/me/addresses', {
    method: 'PUT', json: input, headers: { 'Idempotency-Key': idempotencyKey },
  })
  return response.data.account
}
