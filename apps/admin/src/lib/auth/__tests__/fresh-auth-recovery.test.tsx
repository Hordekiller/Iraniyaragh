import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { AuthProvider, useAuth } from '../AuthProvider';
import { apiFetch, onFreshAuthentication } from '@/lib/api/client';
import { getAccessToken, setAccessToken } from '../token-store';

const principal = { userId: 'test-staff', sessionId: 'test-session', authenticationLevel: 'STAFF_MFA', permissions: ['settings.manage'] };
const response = (code: string, status = 401) => new Response(JSON.stringify({ code, message: 'test denial', requestId: 'test-request', statusCode: status }), { status });
let operation = vi.fn(async () => ({ accessToken: 'test-new-token', principal: { ...principal, sessionId: 'test-fresh-session' } }));

function Panel() {
  const auth = useAuth();
  const [draft, setDraft] = useState('');
  return <>
    <span data-testid="identity">{auth.user?.userId ?? 'none'}</span>
    <span data-testid="fresh">{String(auth.freshAuthenticationRequired)}</span>
    <span data-testid="dialog">{String(auth.freshAuthenticationOpen)}</span>
    <input aria-label="draft" value={draft} onChange={event => setDraft(event.target.value)} />
    <button onClick={() => auth.establishSession({ accessToken: 'test-token', principal })}>login</button>
    <button onClick={() => void apiFetch('/protected', { method: 'PUT', token: getAccessToken(), body: { draft } }).catch(() => undefined)}>save</button>
    <button onClick={auth.dismissFreshAuthentication}>cancel</button>
    <button onClick={auth.showFreshAuthentication}>open</button>
    <button onClick={() => void auth.reauthenticate(operation).catch(() => undefined)}>reauthenticate</button>
  </>;
}

describe('authoritative Admin auth outcomes', () => {
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });
  function setup(code: string, status = 401) {
    operation = vi.fn(async () => ({ accessToken: 'test-new-token', principal: { ...principal, sessionId: 'test-fresh-session' } }));
    const fetchMock = vi.fn(async () => response(code, status));
    vi.stubGlobal('fetch', fetchMock);
    render(<AuthProvider><Panel /></AuthProvider>);
    fireEvent.click(screen.getByText('login'));
    fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'unsaved intent' } });
    return fetchMock;
  }
  it('preserves the identity and draft at the MFA boundary, with deliberate resubmit only', async () => {
    const fetchMock = setup('AUTH_REAUTHENTICATION_REQUIRED');
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(screen.getByTestId('fresh')).toHaveTextContent('true'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('identity')).toHaveTextContent('test-staff');
    expect(screen.getByLabelText('draft')).toHaveValue('unsaved intent');
    fireEvent.click(screen.getByText('cancel'));
    expect(screen.getByTestId('dialog')).toHaveTextContent('false');
    expect(screen.getByTestId('fresh')).toHaveTextContent('true');
    fireEvent.click(screen.getByText('open'));
    const completed = vi.fn();
    const unsubscribe = onFreshAuthentication(completed);
    fireEvent.click(screen.getByText('reauthenticate'));
    await waitFor(() => expect(getAccessToken()).toBe('test-new-token'));
    expect(completed).toHaveBeenCalledOnce();
    unsubscribe();
    expect(screen.getByTestId('fresh')).toHaveTextContent('false');
    expect(screen.getByLabelText('draft')).toHaveValue('unsaved intent');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]).toBeDefined();
  });
  it.each(['AUTH_SESSION_INVALID', 'AUTH_SESSION_REPLAYED'])('clears identity after terminal %s', async code => {
    setup(code);
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(screen.getByTestId('identity')).toHaveTextContent('none'));
    expect(getAccessToken()).toBeNull();
  });
  it.each(['FORBIDDEN', 'AUTH_CSRF_INVALID'])('retains identity after %s without a reauthentication loop', async code => {
    setup(code, 403);
    fireEvent.click(screen.getByText('save'));
    await act(async () => undefined);
    expect(screen.getByTestId('identity')).toHaveTextContent('test-staff');
    expect(screen.getByTestId('dialog')).toHaveTextContent('false');
  });
  it('does not revoke identity for an offline request', async () => {
    const mock = setup('unused');
    mock.mockRejectedValueOnce(new TypeError('offline'));
    fireEvent.click(screen.getByText('save'));
    await act(async () => undefined);
    expect(getAccessToken()).toBe('test-token');
    expect(screen.getByTestId('fresh')).toHaveTextContent('false');
  });
  it('rejects a different account during fresh authentication and never replays its draft', async () => {
    const mock = setup('unused');
    operation.mockResolvedValueOnce({ accessToken: 'other-test-token', principal: { ...principal, userId: 'other-staff' } });
    fireEvent.click(screen.getByText('reauthenticate'));
    await waitFor(() => expect(screen.getByTestId('identity')).toHaveTextContent('none'));
    expect(getAccessToken()).toBeNull();
    expect(mock).not.toHaveBeenCalled();
  });
  it('ignores a delayed 401 from the previous login', async () => {
    const mock = setup('unused');
    let resolve!: (value: Response) => void;
    mock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    fireEvent.click(screen.getByText('save'));
    fireEvent.click(screen.getByText('reauthenticate'));
    await waitFor(() => expect(getAccessToken()).toBe('test-new-token'));
    await act(async () => { resolve(response('AUTH_SESSION_REPLAYED')); });
    expect(getAccessToken()).toBe('test-new-token');
    expect(screen.getByTestId('identity')).toHaveTextContent('test-staff');
  });
});
