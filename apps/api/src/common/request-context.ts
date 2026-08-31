import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  requestId: string;
  correlationId: string;
  startedAt: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const NO_REQUEST_ID = 'no-request-id';

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string {
  return storage.getStore()?.requestId ?? NO_REQUEST_ID;
}
