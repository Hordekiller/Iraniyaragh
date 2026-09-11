import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,96}$/u;
const SERIALIZABLE_RETRIES = 3;
const DEFAULT_RETENTION_HOURS = 24;

function retentionHours(): number {
  const configured = Number(process.env.CATALOG_IDEMPOTENCY_RETENTION_HOURS);
  return Number.isInteger(configured) && configured >= 1 && configured <= 72
    ? configured
    : DEFAULT_RETENTION_HOURS;
}

type IdempotentCommand<T> = {
  actorId: string;
  scope: string;
  key: string;
  payload: unknown;
  execute: (tx: Prisma.TransactionClient) => Promise<{
    response: T;
    resourceType?: string;
    resourceId?: string;
  }>;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function conflict(): ConflictException {
  return new ConflictException({
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'The idempotency key was already used for a different command.',
  });
}

@Injectable()
export class CatalogIdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>({ actorId, scope, key, payload, execute }: IdempotentCommand<T>): Promise<T> {
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Idempotency-Key must contain 8-96 ASCII letters, digits, underscores or hyphens.',
      });
    }

    const keyHash = sha256(key);
    const payloadHash = sha256(stableJson(payload));

    for (let attempt = 1; attempt <= SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(async tx => {
          const existing = await tx.catalogIdempotencyRecord.findUnique({
            where: { actorId_scope_keyHash: { actorId, scope, keyHash } },
          });

          if (existing) {
            if (existing.payloadHash !== payloadHash) throw conflict();
            if (existing.response === null) {
              throw new ConflictException({ code: 'CONFLICT', message: 'Idempotent command is still being committed.' });
            }
            return existing.response as T;
          }

          const record = await tx.catalogIdempotencyRecord.create({
            data: {
              actorId,
              scope,
              keyHash,
              payloadHash,
              expiresAt: new Date(Date.now() + retentionHours() * 60 * 60 * 1000),
            },
          });
          const result = await execute(tx);
          await tx.catalogIdempotencyRecord.update({
            where: { id: record.id },
            data: {
              response: result.response as Prisma.InputJsonValue,
              resourceType: result.resourceType,
              resourceId: result.resourceId,
            },
          });
          return result.response;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < SERIALIZABLE_RETRIES) {
          continue;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const winner = await this.prisma.catalogIdempotencyRecord.findUnique({
            where: { actorId_scope_keyHash: { actorId, scope, keyHash } },
          });
          if (winner) {
            if (winner.payloadHash !== payloadHash) throw conflict();
            if (winner.response !== null) return winner.response as T;
          }
        }
        throw error;
      }
    }

    throw new ConflictException({ code: 'CONFLICT', message: 'The command could not be committed safely; retry with the same key.' });
  }
}
