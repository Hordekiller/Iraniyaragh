import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlogPostInput } from '@iranyaragh/contracts';
import { createBlogPost, newBlogCommandKey, transitionBlogPost, updateBlogPost } from './blog-api';
import type { BlogCommand } from './blog-api';

const COMMANDS: BlogCommand[] = ['create', 'update', 'submit', 'return-to-draft', 'publish', 'unpublish', 'archive'];
const input: BlogPostInput = { slug: 'راهنما', title: 'راهنما', excerpt: 'خلاصه', bodyHtml: '<p>متن</p>', coverMediaId: null, coverAlt: null, tags: [], seoTitle: null, seoDescription: null, sources: [] };
const post = { id: 'p1', version: 1 };

describe('blog command keys', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(COMMANDS)('builds a header-safe, bounded and unique key for %s', (command) => {
    const key = newBlogCommandKey(command);
    expect(key).toMatch(new RegExp(`^blog-${command}-[0-9a-f-]{36}$`, 'u'));
    expect(key.length).toBeLessThanOrEqual(128);
    // A browser throws from fetch() for a header value outside Latin-1, before any request is sent.
    expect(() => new Headers({ 'Idempotency-Key': key })).not.toThrow();
    expect(newBlogCommandKey(command)).not.toBe(key);
  });

  it('documents why a Persian label can never be part of the key', () => {
    expect(() => new Headers({ 'Idempotency-Key': 'blog-ایجاد پیش‌نویس-1' })).toThrow(TypeError);
  });

  it('actually sends create, update and transition requests with their key through fetch', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      // Mirror the browser: building the request validates every header value.
      new Headers(init?.headers);
      return new Response(JSON.stringify({ data: { post }, meta: { requestId: 'r' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(createBlogPost(input, newBlogCommandKey('create'))).resolves.toMatchObject(post);
    await expect(updateBlogPost('p1', 1, input, newBlogCommandKey('update'))).resolves.toMatchObject(post);
    await expect(transitionBlogPost('p1', { action: 'submit', expectedVersion: 1 }, newBlogCommandKey('submit'))).resolves.toMatchObject(post);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get('Idempotency-Key')).toMatch(/^blog-(create|update|submit)-/u);
    }
  });
});
