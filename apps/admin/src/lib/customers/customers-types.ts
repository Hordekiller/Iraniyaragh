import type {
  AdminCustomerAddressesRequest,
  AdminCustomerAuditResponse,
  AdminCustomerCreateRequest,
  AdminCustomerDetailResponse,
  AdminCustomerListResponse,
  AdminCustomerNoteRequest,
  AdminCustomerUpdateRequest,
} from '@iranyaragh/contracts';

export type AdminCustomerQuery = {
  page?: number;
  perPage?: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  hasUserAccount?: boolean;
  sortBy?: 'createdAt' | 'mobile' | 'lastName' | 'orderCount';
  sortDir?: 'asc' | 'desc';
};

export interface AdminCustomersApi {
  listCustomers(
    query: AdminCustomerQuery,
    signal?: AbortSignal,
  ): Promise<AdminCustomerListResponse['data']>;
  getCustomer(
    id: string,
    signal?: AbortSignal,
  ): Promise<AdminCustomerDetailResponse['data']['customer']>;
  createCustomer(input: AdminCustomerCreateRequest, idempotencyKey: string): Promise<void>;
  updateCustomer(
    id: string,
    input: AdminCustomerUpdateRequest,
    idempotencyKey: string,
  ): Promise<void>;
  replaceAddresses(
    id: string,
    input: AdminCustomerAddressesRequest,
    idempotencyKey: string,
  ): Promise<void>;
  addNote(id: string, input: AdminCustomerNoteRequest, idempotencyKey: string): Promise<void>;
  listCustomerHistory(
    id: string,
    page: number,
    perPage: number,
    signal?: AbortSignal,
  ): Promise<AdminCustomerAuditResponse['data']>;
}
