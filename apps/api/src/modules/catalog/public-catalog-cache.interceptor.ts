import { createHash } from "node:crypto";
import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UseInterceptors,
} from "@nestjs/common";
import { ApiHeader, ApiResponse } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { map, type Observable } from "rxjs";

export const PUBLIC_CATALOG_CACHE_CONTROL = "public, no-cache";

export function PublicCatalogCache() {
  return applyDecorators(
    UseInterceptors(PublicCatalogCacheInterceptor),
    ApiHeader({
      name: "If-None-Match",
      required: false,
      description: "Previously returned ETag for conditional revalidation.",
    }),
    ApiResponse({
      status: 304,
      description:
        "The public representation has not changed; no body is returned.",
      headers: {
        ETag: {
          description: "Strong validator for the current representation.",
        },
        "Cache-Control": { description: PUBLIC_CATALOG_CACHE_CONTROL },
      },
    }),
  );
}

export function createPublicCatalogEtag(payload: unknown): string {
  return `"${createHash("sha256").update(JSON.stringify(payload)).digest("base64url")}"`;
}

function matchesIfNoneMatch(value: string | undefined, etag: string): boolean {
  return (
    value?.split(",").some((candidate) => {
      const normalized = candidate.trim();
      return (
        normalized === "*" || normalized === etag || normalized === `W/${etag}`
      );
    }) ?? false
  );
}

@Injectable()
export class PublicCatalogCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((payload: unknown) => {
        const etag = createPublicCatalogEtag(payload);
        response.setHeader("Cache-Control", PUBLIC_CATALOG_CACHE_CONTROL);
        response.setHeader("ETag", etag);
        if (matchesIfNoneMatch(request.headers["if-none-match"], etag)) {
          response.status(304);
          return undefined;
        }
        return payload;
      }),
    );
  }
}
