import type { ApiSuccess } from './api';

export type HomepageCollectionSort = 'NEWEST' | 'BESTSELLING';
export type HomepageCollectionSection =
  | { kind?: 'CATEGORY'; categoryId: string; sortBy: HomepageCollectionSort }
  | { kind: 'ALL_PRODUCTS'; sortBy: HomepageCollectionSort };
/** Accept the old category request shape (without `kind`) while allowing all-products sections. */
export type HomepageCollectionSectionInput = { kind?: 'CATEGORY' | 'ALL_PRODUCTS'; categoryId?: string; sortBy: HomepageCollectionSort };
export type HomepageCollectionsConfig = {
  version: number;
  sections: HomepageCollectionSection[];
  updatedAt: string | null;
};
export type HomepageCollectionsUpdate = {
  expectedVersion: number;
  sections: HomepageCollectionSectionInput[];
};
export type HomepageCollectionsResponse = ApiSuccess<{ config: HomepageCollectionsConfig }>;
