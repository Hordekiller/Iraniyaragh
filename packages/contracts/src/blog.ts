import type { ApiSuccess } from './api';

export const BLOG_PAGE_SIZE = 12;
export const BLOG_MAX_TAGS = 8;
export const BLOG_MAX_SOURCES = 10;

export type BlogPostStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type BlogSource = { title: string; url: string; /** ISO date the source was last checked. */ accessedAt: string };
export type BlogImage = { url: string; width: number; height: number; alt: string };

/** Editor-authored content. `bodyHtml` is sanitized on the server; clients are never trusted. */
export type BlogPostInput = {
  slug: string;
  title: string;
  /** Concise answer summary: listings, meta fallback and answer engines. */
  excerpt: string;
  bodyHtml: string;
  coverMediaId: string | null;
  coverAlt: string | null;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  sources: BlogSource[];
};

export type BlogPostAdminSummary = {
  id: string; slug: string; title: string; status: BlogPostStatus; version: number;
  authorName: string | null; publishedAt: string | null; updatedAt: string;
};
export type BlogPostAdmin = BlogPostInput & {
  id: string; status: BlogPostStatus; version: number;
  authorId: string; authorName: string | null; reviewerId: string | null; reviewerName: string | null;
  /** True when the reviewer who published is also the author (no independent review). */
  selfReviewed: boolean;
  publishedAt: string | null; contentUpdatedAt: string; archivedAt: string | null; createdAt: string; updatedAt: string;
  cover: BlogImage | null;
};
export type BlogRevisionSummary = { version: number; actorName: string | null; createdAt: string; title: string; status: BlogPostStatus };
export type BlogMediaOption = { id: string; url: string; width: number; height: number; alt: string; productName: string };

export type BlogTransitionAction = 'submit' | 'return-to-draft' | 'publish' | 'unpublish' | 'archive';
export type BlogTransitionRequest = { action: BlogTransitionAction; expectedVersion: number; /** Publish only: ISO time; future schedules. */ publishAt?: string | null };

export type BlogPublicSummary = {
  slug: string; title: string; excerpt: string; cover: BlogImage | null; tags: string[];
  publishedAt: string; updatedAt: string; readingMinutes: number;
};
export type BlogPublicPost = BlogPublicSummary & {
  bodyHtml: string; sources: BlogSource[]; seoTitle: string | null; seoDescription: string | null;
};
export type BlogPublicList = { items: BlogPublicSummary[]; meta: { page: number; pages: number; total: number; perPage: number } };
/** A renamed article answers with `redirectSlug`; clients issue a permanent redirect. */
export type BlogPublicPostResult = { post: BlogPublicPost | null; redirectSlug: string | null };

export type BlogPublicListResponse = ApiSuccess<BlogPublicList>;
export type BlogPublicPostResponse = ApiSuccess<BlogPublicPostResult>;
export type BlogAdminListResponse = ApiSuccess<{ items: BlogPostAdminSummary[]; meta: { page: number; pages: number; total: number; perPage: number } }>;
export type BlogAdminPostResponse = ApiSuccess<{ post: BlogPostAdmin }>;
export type BlogRevisionsResponse = ApiSuccess<{ items: BlogRevisionSummary[] }>;
export type BlogMediaOptionsResponse = ApiSuccess<{ items: BlogMediaOption[] }>;
