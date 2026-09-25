export const OUTBOX_QUEUE = Symbol('OUTBOX_QUEUE');

/** The queue carries only an opaque database event ID, never the event payload. */
export interface OutboxQueue {
  enqueue(eventId: string): Promise<void>;
}
