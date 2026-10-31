import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readProductDescriptionDraft, writeProductDescriptionDraft, type ProductDescriptionDraft } from '../product-description-draft';

const snapshot: ProductDescriptionDraft = { schema: 1, productId: 'p1', baseVersion: 3, draft: '<h2>راهنمای نصب</h2>', pending: null };
describe('Product description tab recovery', () => {
  beforeEach(() => sessionStorage.clear());
  it('partitions recovery by staff identity and product, and explicitly removes it', () => {
    expect(writeProductDescriptionDraft('staff1', 'p1', snapshot)).toBe(true);
    expect(readProductDescriptionDraft('staff1', 'p1')).toEqual(snapshot);
    expect(readProductDescriptionDraft('staff2', 'p1')).toBeNull();
    expect(readProductDescriptionDraft('staff1', 'p2')).toBeNull();
    expect(writeProductDescriptionDraft('staff1', 'p1', null)).toBe(true);
    expect(readProductDescriptionDraft('staff1', 'p1')).toBeNull();
  });
  it('keeps the exact original retry payload together with later unsaved text', () => {
    const value = { ...snapshot, pending: { draft: '<p>ثبت اول</p>', description: '<p>ثبت اول</p>', expectedVersion: 2, key: 'description-original-key' } };
    expect(writeProductDescriptionDraft('staff1', 'p1', value)).toBe(true);
    expect(readProductDescriptionDraft('staff1', 'p1')).toEqual(value);
  });
  it.each(['{', 'null', '{}', JSON.stringify({ ...snapshot, schema: 2 }), JSON.stringify({ ...snapshot, productId: 'p2' }), JSON.stringify({ ...snapshot, baseVersion: -1 }), JSON.stringify({ ...snapshot, draft: 'x'.repeat(200001) }), JSON.stringify({ ...snapshot, pending: { draft: 'first', description: 'changed', expectedVersion: 1, key: 'valid-key' } }), JSON.stringify({ ...snapshot, pending: { draft: '', description: null, expectedVersion: 1, key: 'bad key' } }), JSON.stringify({ ...snapshot, pending: { draft: '', description: null, expectedVersion: 1.5, key: 'valid-key' } })])('ignores corrupt, oversized or incompatible storage without exposing it as saved content', raw => {
    sessionStorage.setItem('iranyaragh:product-description:v1:staff1:p1', raw);
    expect(readProductDescriptionDraft('staff1', 'p1')).toBeNull();
  });
  it('reports quota/privacy failure and never truncates the draft', () => {
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    expect(writeProductDescriptionDraft('staff1', 'p1', snapshot)).toBe(false);
    Storage.prototype.setItem = original;
    expect(writeProductDescriptionDraft('staff1', 'p1', { ...snapshot, draft: 'x'.repeat(200001) })).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });
});
