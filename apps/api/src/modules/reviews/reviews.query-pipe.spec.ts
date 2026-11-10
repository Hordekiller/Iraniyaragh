import 'reflect-metadata';
import { BadRequestException, ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AdminQuery, PublicQuery, optionalInteger } from './reviews.controller';

// main.ts installs this pipe globally; the controller then applies its own route pipe to the result.
const globalPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const routePipe = (expectedType: new () => object) => new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });
const through = async <T extends object>(type: new () => T, query: Record<string, unknown>): Promise<T> => {
  const metadata: ArgumentMetadata = { type: 'query', metatype: type };
  return routePipe(type).transform(await globalPipe.transform(query, metadata), metadata) as Promise<T>;
};

describe('review list query validation through the production pipe chain', () => {
  it('keeps an absent optional number absent instead of turning it into NaN', () => {
    expect(optionalInteger({ value: undefined })).toBeUndefined();
    expect(optionalInteger({ value: null })).toBeUndefined();
    expect(optionalInteger({ value: '4' })).toBe(4);
    expect(optionalInteger({ value: 'abc' })).toBeNaN();
  });

  it('accepts the default Admin list request, whose optional filters are own undefined properties in the compiled class', async () => {
    // The production build emits `rating;` class fields, so the first pipe returns these keys as undefined.
    const compiledShape = { page: '1', status: 'PENDING', q: undefined, productId: undefined, rating: undefined };
    await expect(through(AdminQuery, compiledShape)).resolves.toMatchObject({ page: 1, status: 'PENDING' });
    expect((await through(AdminQuery, compiledShape)).rating).toBeUndefined();
    await expect(through(AdminQuery, { status: 'PENDING' })).resolves.toMatchObject({ page: 1 });
  });

  it('still parses and bounds a supplied rating and page', async () => {
    await expect(through(AdminQuery, { page: '2', rating: '5' })).resolves.toMatchObject({ page: 2, rating: 5 });
    for (const bad of [{ rating: '0' }, { rating: '6' }, { rating: 'abc' }, { rating: '3.5' }, { rating: '' }, { page: '0' }, { page: 'abc' }, { status: 'NOPE' }, { extra: '1' }]) {
      await expect(through(AdminQuery, bad), JSON.stringify(bad)).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(through(PublicQuery, {})).resolves.toMatchObject({ page: 1, sort: 'newest' });
    await expect(through(PublicQuery, { page: '999999999' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
