import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
  createPublicCatalogEtag,
  PUBLIC_CATALOG_CACHE_CONTROL,
  PublicCatalogCacheInterceptor,
} from "./public-catalog-cache.interceptor";

function context(ifNoneMatch?: string) {
  const response = { setHeader: vi.fn(), status: vi.fn() };
  const executionContext = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { "if-none-match": ifNoneMatch } }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { executionContext, response };
}

describe("PublicCatalogCacheInterceptor", () => {
  const payload = { data: { items: [{ id: "product-1" }] } };

  it("emits a deterministic strong ETag and requires stored responses to revalidate", async () => {
    const { executionContext, response } = context();
    const result = await firstValueFrom(
      new PublicCatalogCacheInterceptor().intercept(executionContext, {
        handle: () => of(payload),
      } as CallHandler),
    );
    expect(result).toBe(payload);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      PUBLIC_CATALOG_CACHE_CONTROL,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "ETag",
      createPublicCatalogEtag(payload),
    );
    expect(response.status).not.toHaveBeenCalled();
  });

  it.each([
    createPublicCatalogEtag(payload),
    `W/${createPublicCatalogEtag(payload)}`,
    `"other", ${createPublicCatalogEtag(payload)}`,
    "*",
  ])(
    "returns no body with 304 for matching If-None-Match value %s",
    async (header) => {
      const { executionContext, response } = context(header);
      const result = await firstValueFrom(
        new PublicCatalogCacheInterceptor().intercept(executionContext, {
          handle: () => of(payload),
        } as CallHandler),
      );
      expect(result).toBeUndefined();
      expect(response.status).toHaveBeenCalledWith(304);
    },
  );

  it("keeps the body when the validator is stale", async () => {
    const { executionContext, response } = context('"stale"');
    const result = await firstValueFrom(
      new PublicCatalogCacheInterceptor().intercept(executionContext, {
        handle: () => of(payload),
      } as CallHandler),
    );
    expect(result).toBe(payload);
    expect(response.status).not.toHaveBeenCalled();
  });
});
