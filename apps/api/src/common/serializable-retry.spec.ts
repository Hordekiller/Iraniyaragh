import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { isPrismaTransactionConflict } from './serializable-retry';

const error = (code: string, sqlState?: string) => new Prisma.PrismaClientKnownRequestError('test database error', {
  code, clientVersion: 'test', ...(sqlState ? { meta: { code: sqlState } } : {}),
});

describe('database transaction conflict classification', () => {
  it.each([error('P2034'), error('P2010', '40001'), error('P2010', '40P01')])('recognizes an authoritative aborted-transaction error', failure => {
    expect(isPrismaTransactionConflict(failure)).toBe(true);
  });
  it.each([null, new Error('40001'), { code: 'P2010', meta: { code: '40001' } }, error('P2002'), error('P2010'), error('P2010', '42601'), error('P2010', '42501'), error('P2010', '08006')])('does not retry arbitrary errors or ambiguous network results', failure => {
    expect(isPrismaTransactionConflict(failure)).toBe(false);
  });
});
