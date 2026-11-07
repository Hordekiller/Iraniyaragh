import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminReviewSummary } from '@iranyaragh/contracts';
import { ApiNetworkError } from '@/lib/api/client';
import { listReviews, moderateReview, replyToReview } from '@/lib/reviews/review-api';
import { ReviewsView } from './ReviewsView';

const auth = vi.hoisted(() => ({ user: { userId: 'u', permissions: ['reviews.read', 'reviews.moderate'] as string[] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/reviews/review-api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/reviews/review-api')>()),
  listReviews: vi.fn(), moderateReview: vi.fn(), replyToReview: vi.fn(),
}));

const review = (over: Partial<AdminReviewSummary> = {}): AdminReviewSummary => ({
  id: 'r1', productId: 'p', productName: 'لولا', productSlug: 'hinge', customerName: 'احمد', rating: 4, title: null, body: 'کیفیت خوب بود',
  status: 'PENDING', version: 1, moderationNote: null, moderatedByName: null, moderatedAt: null, staffReply: null, staffRepliedByName: null, staffRepliedAt: null,
  orderId: 'o', publishedAt: null, createdAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z', ...over,
});
const list = (items: AdminReviewSummary[]) => ({ items, pending: items.length, meta: { page: 1, pages: 1, total: items.length, perPage: 10 } });
const keyOf = (mock: typeof moderateReview, call: number) => vi.mocked(mock).mock.calls[call]![2];

describe('review moderation idempotency', () => {
  beforeEach(() => {
    auth.user.permissions = ['reviews.read', 'reviews.moderate'];
    vi.mocked(listReviews).mockReset().mockResolvedValue(list([review()]));
    vi.mocked(moderateReview).mockReset();
    vi.mocked(replyToReview).mockReset();
  });

  it('retries a lost response with the same key and a changed note with a new one', async () => {
    vi.mocked(moderateReview).mockRejectedValueOnce(new ApiNetworkError('lost')).mockRejectedValueOnce(new ApiNetworkError('lost')).mockResolvedValue(review({ status: 'REJECTED', version: 2 }));
    render(<ReviewsView />);
    fireEvent.click(await screen.findByRole('button', { name: 'رد' }));
    const note = await screen.findByLabelText(/دلیل/);
    fireEvent.change(note, { target: { value: 'ناهمخوان با تجربه' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت' }));
    expect(await screen.findByText(/ممکن است ثبت شده باشد/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت' }));
    await waitFor(() => expect(moderateReview).toHaveBeenCalledTimes(2));
    expect(keyOf(moderateReview, 1)).toBe(keyOf(moderateReview, 0));
    fireEvent.change(note, { target: { value: 'دلیل دیگر برای رد' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت' }));
    await waitFor(() => expect(moderateReview).toHaveBeenCalledTimes(3));
    expect(keyOf(moderateReview, 2)).not.toBe(keyOf(moderateReview, 0));
  });

  it('uses a new key for a different dialog or a reloaded review version', async () => {
    vi.mocked(moderateReview).mockRejectedValue(new ApiNetworkError('lost'));
    render(<ReviewsView />);
    fireEvent.click(await screen.findByRole('button', { name: 'تأیید و انتشار' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ثبت' }));
    await screen.findByText(/ممکن است ثبت شده باشد/);
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The same unchanged dialog reopened is the same command and replays.
    fireEvent.click(screen.getByRole('button', { name: 'تأیید و انتشار' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ثبت' }));
    await waitFor(() => expect(moderateReview).toHaveBeenCalledTimes(2));
    expect(keyOf(moderateReview, 1)).toBe(keyOf(moderateReview, 0));
    // After the review changed (new version), the command is different.
    vi.mocked(listReviews).mockResolvedValue(list([review({ version: 2 })]));
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'وضعیت' }));
    fireEvent.click(await screen.findByRole('option', { name: 'همه' }));
    await waitFor(() => expect(listReviews).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole('button', { name: 'تأیید و انتشار' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ثبت' }));
    await waitFor(() => expect(moderateReview).toHaveBeenCalledTimes(3));
    expect(keyOf(moderateReview, 2)).not.toBe(keyOf(moderateReview, 0));
    expect(vi.mocked(moderateReview).mock.calls[2]![1]).toMatchObject({ expectedVersion: 2 });
  });

  it('keeps the reply key stable across a failed attempt and renews it after success', async () => {
    vi.mocked(listReviews).mockResolvedValue(list([review({ status: 'APPROVED', version: 3, publishedAt: '2026-11-02T08:00:00.000Z' })]));
    vi.mocked(replyToReview).mockRejectedValueOnce(new ApiNetworkError('lost')).mockResolvedValue(review({ status: 'APPROVED', version: 4 }));
    render(<ReviewsView />);
    fireEvent.click(await screen.findByRole('button', { name: 'پاسخ' }));
    fireEvent.change(await screen.findByLabelText('متن پاسخ'), { target: { value: 'ممنون از نظرتان' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت' }));
    await screen.findByText(/ممکن است ثبت شده باشد/);
    fireEvent.click(screen.getByRole('button', { name: 'ثبت' }));
    await waitFor(() => expect(replyToReview).toHaveBeenCalledTimes(2));
    expect(vi.mocked(replyToReview).mock.calls[1]![2]).toBe(vi.mocked(replyToReview).mock.calls[0]![2]);
    expect(vi.mocked(replyToReview).mock.calls[1]![1]).toEqual({ expectedVersion: 3, reply: 'ممنون از نظرتان' });
  });
});
