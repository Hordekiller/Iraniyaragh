import { randomInt } from 'node:crypto';

const RETRY_BASE_DELAY_MS = 25;
const RETRY_MAX_DELAY_MS = 150;

export function retryDelayMs(attempt: number): number {
  const cap = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  const half = Math.floor(cap / 2);
  return half + randomInt(half + 1);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}