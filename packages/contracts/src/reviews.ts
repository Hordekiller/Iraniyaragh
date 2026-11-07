import type { ApiSuccess } from './api';

export const REVIEW_PAGE_SIZE = 10;
export const REVIEW_BODY_MIN = 10;
export const REVIEW_BODY_MAX = 2000;
export const REVIEW_TITLE_MAX = 100;
export const REVIEW_REPLY_MAX = 1000;
export const REVIEW_NOTE_MAX = 300;

export type ProductReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN';
export type ReviewSort = 'newest' | 'highest' | 'lowest';

/** Customer-authored fields. Ownership, product eligibility and status are never client-supplied. */
export type ReviewInput = { rating: number; title: string | null; body: string };

/** Distribution of approved ratings; `counts[0]` is one star, `counts[4]` is five. */
export type ReviewSummary = { count: number; average: number | null; counts: [number, number, number, number, number] };

export type PublicReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  /** First name plus last initial; never a mobile number. */
  authorName: string;
  verifiedPurchase: true;
  publishedAt: string;
  staffReply: string | null;
  staffRepliedAt: string | null;
};
export type PublicReviewList = {
  summary: ReviewSummary;
  items: PublicReview[];
  meta: { page: number; pages: number; total: number; perPage: number };
};

/** What the signed-in customer may do for one product. */
export type OwnReview = {
  id: string; rating: number; title: string | null; body: string; status: ProductReviewStatus; version: number;
  /** Shown to the author when a moderator rejected or hid the review. */
  moderationNote: string | null; createdAt: string; updatedAt: string;
};
export type ReviewEligibility = {
  /** True when a delivered order contains the product and no review exists yet. */
  canReview: boolean;
  reason: 'ELIGIBLE' | 'NOT_PURCHASED' | 'ALREADY_REVIEWED';
  review: OwnReview | null;
};

export type AdminReviewSummary = {
  id: string; productId: string; productName: string; productSlug: string; customerName: string;
  rating: number; title: string | null; body: string; status: ProductReviewStatus; version: number;
  moderationNote: string | null; moderatedByName: string | null; moderatedAt: string | null;
  staffReply: string | null; staffRepliedByName: string | null; staffRepliedAt: string | null;
  orderId: string; publishedAt: string | null; createdAt: string; updatedAt: string;
};
export type AdminReviewList = {
  items: AdminReviewSummary[];
  meta: { page: number; pages: number; total: number; perPage: number };
  /** Awaiting moderation; drives the navigation badge. */
  pending: number;
};

export type ReviewModerationAction = 'approve' | 'reject' | 'hide';
export type ReviewModerationRequest = { action: ReviewModerationAction; expectedVersion: number; note: string | null };
export type ReviewReplyRequest = { expectedVersion: number; /** Empty/null removes the reply. */ reply: string | null };

export type PublicReviewListResponse = ApiSuccess<PublicReviewList>;
export type ReviewEligibilityResponse = ApiSuccess<ReviewEligibility>;
export type OwnReviewResponse = ApiSuccess<{ review: OwnReview }>;
export type AdminReviewListResponse = ApiSuccess<AdminReviewList>;
export type AdminReviewResponse = ApiSuccess<{ review: AdminReviewSummary }>;

/** Rating aggregate per product for listing cards; products without approved reviews are omitted. */
export type ReviewSummaryItem = { productId: string; average: number; count: number };
export type ReviewSummariesResponse = ApiSuccess<{ items: ReviewSummaryItem[] }>;
export const REVIEW_SUMMARY_MAX_IDS = 100;
