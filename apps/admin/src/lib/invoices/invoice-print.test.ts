import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareInvoicePrint } from './invoice-print';
describe('Bounded local invoice print preparation', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  function sheet(ready: boolean, fonts: unknown[] = [{ status: 'loaded' }]) {
    const node = document.createElement('article'); const logo = document.createElement('img');
    Object.defineProperties(logo, { complete: { value: ready }, naturalWidth: { value: ready ? 1086 : 0 }, decode: { value: vi.fn(async () => undefined) } });
    node.append(logo); const load = vi.fn(async () => fonts);
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true }); return { node, load };
  }
  it('waits for the local logo and both Persian font weights before printing is permitted', async () => {
    const { node, load } = sheet(true); await prepareInvoicePrint(node);
    expect(load).toHaveBeenCalledWith('400 12px "Iraniyaragh Sans"', 'ایرانی یراق');
    expect(load).toHaveBeenCalledWith('700 12px "Iraniyaragh Sans"', 'ایرانی یراق');
  });
  it('a failed logo cannot become a printable document', async () => { await expect(prepareInvoicePrint(sheet(false).node)).rejects.toThrow('Print image unavailable'); });
  it('missing local Persian fonts cannot silently turn into a fallback font success', async () => { await expect(prepareInvoicePrint(sheet(true, []).node)).rejects.toThrow('Print font unavailable'); });
  it('a stalled asset cannot block the UI indefinitely', async () => {
    vi.useFakeTimers(); const { node, load } = sheet(true); load.mockImplementation(() => new Promise(() => undefined));
    const failure = expect(prepareInvoicePrint(node)).rejects.toThrow('Print assets unavailable');
    await vi.advanceTimersByTimeAsync(5000); await failure; expect(vi.getTimerCount()).toBe(0);
  });
});
