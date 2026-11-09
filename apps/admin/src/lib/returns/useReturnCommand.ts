'use client';
import { useEffect, useRef, useState } from 'react';
import { randomUuid } from '@/lib/crypto/random-uuid';
import { returnErrorMessage, returnOutcomeUnknown } from './returns-ui';

/**
 * Runs one money/stock command with a stable Idempotency-Key. After an ambiguous
 * outcome (network failure, 5xx) the SAME request and key are kept, so a retry
 * can never record the return or the refund twice.
 */
export function useReturnCommand<T>(onSaved: (result: T) => void) {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const inFlight = useRef(false);
  const pending = useRef<(() => Promise<T>) | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function execute(request: () => Promise<T>) {
    if (!alive.current || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const result = await request();
      if (!alive.current) return;
      pending.current = null; setUncertain(false); onSaved(result);
    } catch (failure) {
      if (!alive.current) return;
      const ambiguous = returnOutcomeUnknown(failure);
      if (!ambiguous) pending.current = null;
      setUncertain(ambiguous); setError(returnErrorMessage(failure));
    } finally {
      inFlight.current = false; if (alive.current) setBusy(false);
    }
  }

  function run(make: (key: string) => () => Promise<T>) {
    if (!alive.current || inFlight.current || pending.current) return;
    pending.current = make(`return-${randomUuid()}`);
    void execute(pending.current);
  }

  async function retry() {
    if (pending.current) await execute(pending.current);
  }

  return { busy, uncertain, error, run, retry, setError };
}
