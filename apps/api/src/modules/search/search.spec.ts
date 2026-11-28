import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CatalogIdempotencyService } from '../catalog/catalog-idempotency.service';
import { CatalogService } from '../catalog/catalog.service';
import { RateLimitService } from '../auth/rate-limit.service';
import { SearchAdminService } from './search-admin.service';
import { SearchController } from './search.controller';
import { SearchEngine } from './search-engine.service';
import { keyboardAlternative, rankedSearchSql } from './search-query';

describe('Search query safeguards', () => {
  it('corrects only a supported Latin keyboard sequence', () => {
    expect(keyboardAlternative('g,gh')).toBe('لولا');
    expect(keyboardAlternative('K63')).toBeNull();
    expect(keyboardAlternative('لو')).toBeNull();
    expect(keyboardAlternative('ab')).toBeNull();
  });

  it('parameterizes query values and never fuzzy-matches numeric sizes', () => {
    const numeric = rankedSearchSql(['لولا 45']);
    expect(numeric.sql).not.toContain('45');
    expect(numeric.values).toContain('45');
    expect(numeric.sql).toContain('levenshtein_less_equal');
    const identifier = rankedSearchSql(['K63']);
    expect(identifier.sql).not.toContain('levenshtein_less_equal');
    expect(rankedSearchSql([]).sql).toContain('WHERE FALSE');
  });
});

describe('Search engine failure boundaries', () => {
  it('rejects oversized input before reading storage and ignores one-character input', async () => {
    const transaction = vi.fn();
    const engine = new SearchEngine({ $transaction: transaction } as unknown as PrismaService);
    await expect(engine.search({ search: 'x'.repeat(151) })).rejects.toBeInstanceOf(BadRequestException);
    expect((await engine.search({ search: 'ل' })).total).toBe(0);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns a ranked page and facets from a bounded transaction', async () => {
    const results: unknown[] = [
      [{ q: 'ریل', keyboard: '' }], [], [], [{ id: 'p1' }], [{ total: 1n }],
      [{ kind: 'category', id: 'c1', name: 'ریل', slug: 'rail', count: 1n }],
    ];
    const queryRaw = vi.fn().mockImplementation(async () => results.shift());
    const executeRaw = vi.fn().mockResolvedValue(0);
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $queryRaw: queryRaw, $executeRaw: executeRaw }));
    const engine = new SearchEngine({ $transaction: transaction } as unknown as PrismaService);
    const result = await engine.search({ search: 'ریل', perPage: 8 });
    expect(result).toMatchObject({ ids: ['p1'], total: 1, degraded: false, categories: [{ id: 'c1', count: 1 }] });
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it('uses a bounded title fallback and reports when both paths fail', async () => {
    const fallbackResults: unknown[] = [[{ q: 'ریل' }], [{ id: 'p1' }], [{ total: 1n }]];
    const fallbackQuery = vi.fn().mockImplementation(async () => fallbackResults.shift());
    const transaction = vi.fn().mockRejectedValueOnce(new Error('projection unavailable'))
      .mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $executeRaw: vi.fn(), $queryRaw: fallbackQuery }));
    const engine = new SearchEngine({ $transaction: transaction } as unknown as PrismaService);
    expect(await engine.search({ search: 'ریل' })).toMatchObject({ ids: ['p1'], total: 1, degraded: true });
    const broken = new SearchEngine({ $transaction: vi.fn().mockRejectedValue(new Error('database down')) } as unknown as PrismaService);
    await expect(broken.search({ search: 'ریل' })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('Search administration privacy', () => {
  it('aggregates recognized terms but never retains a numeric or email query', async () => {
    const labels: string[] = [];
    let normalized = 'لولا';
    const queryRaw = vi.fn().mockImplementation(async () => [{ query: normalized }]);
    const executeRaw = vi.fn().mockImplementation(async (parts: TemplateStringsArray, ...values: unknown[]) => {
      if (parts.join('').includes('INSERT INTO')) labels.push(String(values[0]));
      return 1;
    });
    const tx = { $executeRaw: executeRaw, $queryRaw: queryRaw };
    const prisma = { $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)) } as unknown as PrismaService;
    const admin = new SearchAdminService(prisma, {} as AuditLogService, {} as CatalogIdempotencyService);
    // A known catalog term passes the recognized-token check.
    queryRaw.mockResolvedValueOnce([{ query: 'لولا' }]).mockResolvedValueOnce([{ count: 1n }]);
    await admin.metric('لولا', 2);
    normalized = '09121234567';
    await admin.metric('09121234567', 0);
    normalized = 'email@example.com';
    await admin.metric('email@example.com', 0);
    expect(labels).toEqual(['لولا', '[unrecognized]', '[unrecognized]']);
  });
});

describe('Public search controller', () => {
  it('rate-limits suggestions, returns current catalog data and counts a safe query', async () => {
    const result = { data: { items: [{ id: 'p1' }], meta: { total: 1 } } };
    const catalog = { searchPublicProducts: vi.fn().mockResolvedValue(result) };
    const limits = { enforce: vi.fn().mockResolvedValue(undefined) };
    const admin = { metric: vi.fn().mockResolvedValue(undefined), popular: vi.fn().mockResolvedValue({ data: { queries: [] } }) };
    const controller = new SearchController(catalog as unknown as CatalogService, limits as unknown as RateLimitService, admin as unknown as SearchAdminService);
    const request = { ip: '127.0.0.1', socket: {} } as Parameters<SearchController['suggest']>[1];
    const input = { q: 'لولا' } as Parameters<SearchController['suggest']>[0];
    expect(await controller.suggest(input, request)).toBe(result);
    expect(catalog.searchPublicProducts).toHaveBeenCalledWith(expect.objectContaining({ search: 'لولا', page: 1, perPage: 8, sortBy: 'relevance' }));
    expect(admin.metric).toHaveBeenCalledWith('لولا', 1);
    expect(limits.enforce).toHaveBeenCalledWith(expect.objectContaining({ dimension: 'search:ip-minute' }));
    expect(await controller.products(input, request)).toBe(result);
    expect(await controller.popular(request)).toEqual({ data: { queries: [] } });
  });

  it('records a click only when the product was in the verified suggestion list', async () => {
    const catalog = { searchPublicProducts: vi.fn().mockResolvedValue({ data: { items: [{ id: 'p1' }], meta: { total: 1 } } }) };
    const admin = { metric: vi.fn().mockResolvedValue(undefined) };
    const controller = new SearchController(catalog as unknown as CatalogService, { enforce: vi.fn() } as unknown as RateLimitService, admin as unknown as SearchAdminService);
    const request = { ip: '127.0.0.1', socket: {} } as Parameters<SearchController['click']>[1];
    expect(await controller.click({ q: 'لولا', productId: 'p1' }, request)).toEqual({ data: { recorded: true } });
    expect(await controller.click({ q: 'لولا', productId: 'other' }, request)).toEqual({ data: { recorded: false } });
    expect(admin.metric).toHaveBeenCalledTimes(1);
  });
});
