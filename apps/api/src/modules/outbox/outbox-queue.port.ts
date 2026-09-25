export const OUTBOX_QUEUE = Symbol('OUTBOX_QUEUE');

export const OUTBOX_QUEUE_NAME = 'commerce-outbox';
export const OUTBOX_QUEUE_PREFIX = 'iranyaragh';

/** The queue carries only an opaque database event ID, never the event payload. */
export interface OutboxQueue {
  enqueue(eventId: string): Promise<void>;
}
