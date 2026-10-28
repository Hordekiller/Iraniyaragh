// Keep in sync with the API's CONTENT_HTML_LIMIT_UTF16, including HTML markup.
export const PRODUCT_DESCRIPTION_HTML_LIMIT = 100_000;

export type PendingDescriptionSave = { draft: string; description: string | null; expectedVersion: number; key: string };
export type ProductDescriptionDraft = { schema: 1; productId: string; baseVersion: number; draft: string; pending: PendingDescriptionSave | null };
const draftLimit = PRODUCT_DESCRIPTION_HTML_LIMIT * 2;
const validVersion = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const validText = (value: unknown): value is string => typeof value === 'string' && value.length <= draftLimit;
function storageKey(ownerId: string, productId: string) {
  // Tab-scoped recovery, partitioned by the authenticated staff identity.
  // Only product HTML and retry metadata; no authentication/session state.
  return `iranyaragh:product-description:v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(productId)}`;
}
export function readProductDescriptionDraft(ownerId: string, productId: string): ProductDescriptionDraft | null {
  try {
    const raw = sessionStorage.getItem(storageKey(ownerId, productId));
    if (!raw || raw.length > draftLimit * 4) return null;
    const value = JSON.parse(raw) as ProductDescriptionDraft;
    if (!value || value.schema !== 1 || value.productId !== productId || !validVersion(value.baseVersion) || !validText(value.draft)) return null;
    if (value.pending !== null) {
      const pending = value.pending;
      if (!pending || !validText(pending.draft) || !validVersion(pending.expectedVersion) || typeof pending.key !== 'string' || !/^[A-Za-z0-9_-]{8,96}$/u.test(pending.key)
        || pending.description !== (pending.draft.trim() ? pending.draft : null)) return null;
    }
    return { schema: 1, productId, baseVersion: value.baseVersion, draft: value.draft,
      pending: value.pending ? { draft: value.pending.draft, description: value.pending.description, expectedVersion: value.pending.expectedVersion, key: value.pending.key } : null };
  } catch { return null; }
}
export function writeProductDescriptionDraft(ownerId: string, productId: string, value: ProductDescriptionDraft | null): boolean {
  try {
    const key = storageKey(ownerId, productId);
    if (!value) sessionStorage.removeItem(key);
    else {
      if (!validText(value.draft) || (value.pending && !validText(value.pending.draft))) return false;
      sessionStorage.setItem(key, JSON.stringify(value));
    }
    return true;
  } catch { return false; }
}
