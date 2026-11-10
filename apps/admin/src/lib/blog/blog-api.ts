import type {
  BlogAdminListResponse, BlogAdminPostResponse, BlogMediaOptionsResponse, BlogPostInput, BlogPostStatus, BlogRevisionsResponse, BlogTransitionRequest,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

/** Fixed ASCII command names. A key travels in an HTTP header, which a browser refuses to send unless every character is Latin-1. */
export type BlogCommand = 'create' | 'update' | BlogTransitionRequest['action'];
// The Persian button label used to be interpolated here; `fetch` then threw before sending anything
// and every article save or status change was reported as an unconfirmed request.
export const newBlogCommandKey = (command: BlogCommand) => `blog-${command}-${globalThis.crypto.randomUUID()}`;

export async function listBlogPosts(query: { page: number; status?: BlogPostStatus; q?: string }, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(query.page) });
  if (query.status) params.set('status', query.status);
  if (query.q) params.set('q', query.q);
  return (await apiFetch<BlogAdminListResponse['data']>(`/blog/admin/posts?${params}`, { token: getAccessToken(), signal })).data;
}
export async function readBlogPost(id: string, signal?: AbortSignal) {
  return (await apiFetch<BlogAdminPostResponse['data']>(`/blog/admin/posts/${encodeURIComponent(id)}`, { token: getAccessToken(), signal })).data.post;
}
export async function readBlogRevisions(id: string, signal?: AbortSignal) {
  return (await apiFetch<BlogRevisionsResponse['data']>(`/blog/admin/posts/${encodeURIComponent(id)}/revisions`, { token: getAccessToken(), signal })).data.items;
}
export async function readBlogMedia(signal?: AbortSignal) {
  return (await apiFetch<BlogMediaOptionsResponse['data']>('/blog/admin/media-options', { token: getAccessToken(), signal })).data.items;
}
export async function createBlogPost(post: BlogPostInput, key: string, signal?: AbortSignal) {
  return (await apiFetch<BlogAdminPostResponse['data']>('/blog/admin/posts', { token: getAccessToken(), signal, method: 'POST', body: post, headers: { 'Idempotency-Key': key } })).data.post;
}
export async function updateBlogPost(id: string, expectedVersion: number, post: BlogPostInput, key: string, signal?: AbortSignal) {
  return (await apiFetch<BlogAdminPostResponse['data']>(`/blog/admin/posts/${encodeURIComponent(id)}`, { token: getAccessToken(), signal, method: 'PUT', body: { expectedVersion, post }, headers: { 'Idempotency-Key': key } })).data.post;
}
export async function transitionBlogPost(id: string, request: BlogTransitionRequest, key: string, signal?: AbortSignal) {
  return (await apiFetch<BlogAdminPostResponse['data']>(`/blog/admin/posts/${encodeURIComponent(id)}/transition`, { token: getAccessToken(), signal, method: 'POST', body: request, headers: { 'Idempotency-Key': key } })).data.post;
}
