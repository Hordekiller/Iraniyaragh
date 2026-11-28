import type { ProductListResponse } from './catalog';
export type SearchFacet = { id: string; name: string; slug: string; count: number };
export type SearchResponse = { data: ProductListResponse['data'] & {
  facets: { categories: SearchFacet[]; brands: SearchFacet[] };
  correctedQuery: string | null;
  degraded: boolean;
} };
export type SearchAdminStatus = {
  engine: string; normalizationVersion: number; syncMode: string; documents: number; products: number; missing: number; latest: string | null;
  aliases: { term: string; replacement: string; updatedAt: string }[];
  keywords: { productId: string; keywords: string; boost: number }[];
  metrics: { query: string; searches: number; zeroResults: number; clicks: number }[];
  conversionTracking: boolean;
};
export type SearchAdminCommand = { action: 'alias' | 'keywords' | 'reindex'; term?: string; replacement?: string; productId?: string; keywords?: string; boost?: number; cursor?: string; remove?: boolean };
