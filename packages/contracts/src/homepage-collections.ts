import type { ApiSuccess } from './api';

export type HomepageCollectionSort = 'NEWEST' | 'BESTSELLING';
export type HomepageCollectionSection = { categoryId: string; sortBy: HomepageCollectionSort };
export type HomepageCollectionsConfig = {
  version: number;
  sections: HomepageCollectionSection[];
  updatedAt: string | null;
};
export type HomepageCollectionsUpdate = {
  expectedVersion: number;
  sections: HomepageCollectionSection[];
};
export type HomepageCollectionsResponse = ApiSuccess<{ config: HomepageCollectionsConfig }>;
