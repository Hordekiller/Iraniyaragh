/** Replay-side view of the queue; it may only clear an already terminal job. */
export interface OutboxReplayQueue {
  /** Resolves false while a job is still queued or active, which keeps replay unsafe. */
  clearTerminalJob(eventId: string): Promise<boolean>;
}
