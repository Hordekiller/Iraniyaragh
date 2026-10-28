import type { NestExpressApplication } from '@nestjs/platform-express';

// Product HTML permits 100,000 UTF-16 code units. Persian UTF-8 and JSON
// escapes can exceed Express's default 100 KiB while respecting that limit.
// Keep a finite transport ceiling; DTO/domain limits still apply independently.
export const JSON_BODY_LIMIT_BYTES = 1024 * 1024;
export function configureRequestBody(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT_BYTES });
}
