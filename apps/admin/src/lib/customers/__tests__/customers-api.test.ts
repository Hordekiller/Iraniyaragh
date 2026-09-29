import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => 'token-123'),
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('@/lib/auth/token-store', () => ({ getAccessToken: mocks.getAccessToken }));

import {
  addNote,
  createCustomer,
  getCustomer,
  listCustomers,
  listCustomerHistory,
  newCustomerCommandKey,
  replaceAddresses,
  updateCustomer,
} from '../customers-api';

describe('customers api client', () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset().mockResolvedValue({ data: { items: [], meta: {} } });
  });

  afterEach(() => vi.clearAllMocks());

  it('omits empty filters from the list query', async () => {
    await listCustomers({ page: 1, perPage: 10, search: '', status: undefined });
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/customers/admin?page=1&perPage=10',
      expect.objectContaining({ token: 'token-123' }),
    );
  });

  it('serializes every supported filter including the boolean account flag', async () => {
    await listCustomers({
      page: 2,
      perPage: 25,
      search: '0912',
      status: 'INACTIVE',
      hasUserAccount: false,
      sortBy: 'orderCount',
      sortDir: 'asc',
    });
    const [path] = mocks.apiFetch.mock.calls[0];
    expect(path).toBe(
      '/customers/admin?page=2&perPage=25&search=0912&status=INACTIVE&hasUserAccount=false&sortBy=orderCount&sortDir=asc',
    );
  });

  it('encodes the id in every per-customer path', async () => {
    mocks.apiFetch.mockResolvedValue({ data: { customer: { id: 'a/b' } } });
    await getCustomer('a/b');
    expect(mocks.apiFetch.mock.calls[0][0]).toBe('/customers/admin/a%2Fb');

    await listCustomerHistory('a/b', 3, 10);
    expect(mocks.apiFetch.mock.calls[1][0]).toBe('/customers/admin/a%2Fb/history?page=3&perPage=10');
  });

  it('sends the idempotency key on every mutation', async () => {
    await createCustomer({ mobile: '09123456789' }, 'key-1');
    expect(mocks.apiFetch).toHaveBeenLastCalledWith(
      '/customers/admin',
      expect.objectContaining({
        method: 'POST',
        body: { mobile: '09123456789' },
        headers: { 'Idempotency-Key': 'key-1' },
      }),
    );

    await updateCustomer('c1', { expectedVersion: 2, firstName: null }, 'key-2');
    expect(mocks.apiFetch).toHaveBeenLastCalledWith(
      '/customers/admin/c1',
      expect.objectContaining({ method: 'PATCH', headers: { 'Idempotency-Key': 'key-2' } }),
    );

    await replaceAddresses('c1', { expectedVersion: 3, addresses: [] }, 'key-3');
    expect(mocks.apiFetch).toHaveBeenLastCalledWith(
      '/customers/admin/c1/addresses',
      expect.objectContaining({ method: 'PUT', headers: { 'Idempotency-Key': 'key-3' } }),
    );

    await addNote('c1', { expectedVersion: 4, visibility: 'INTERNAL', body: 'hi' }, 'key-4');
    expect(mocks.apiFetch).toHaveBeenLastCalledWith(
      '/customers/admin/c1/notes',
      expect.objectContaining({ method: 'POST', headers: { 'Idempotency-Key': 'key-4' } }),
    );
  });

  it('mints a distinct key per command', () => {
    expect(newCustomerCommandKey('create')).not.toBe(newCustomerCommandKey('create'));
    expect(newCustomerCommandKey('create')).toMatch(/^customer-create-/);
  });
});
