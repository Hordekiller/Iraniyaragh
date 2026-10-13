'use client';
import { useEffect, useRef, useState } from 'react';
import type { CreditCommandResult } from '@iranyaragh/contracts';
import { randomUuid } from '@/lib/crypto/random-uuid';
import { creditError, creditOutcomeUnknown } from './credit-ui';
/** Keep the submitted payload and key together until an ambiguous command is reconciled. */
export function useCreditCommand(onSaved: (result: CreditCommandResult) => void) {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const inFlight = useRef(false);
  const pending = useRef<(() => Promise<CreditCommandResult>) | null>(null);
  const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false); const [error, setError] = useState<string | null>(null);
  async function execute(request: () => Promise<CreditCommandResult>) {
    if (!alive.current || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { const result = await request(); if (!alive.current) return; pending.current = null; setUncertain(false); onSaved(result); }
    catch (failure) { if (!alive.current) return; const ambiguous = creditOutcomeUnknown(failure); if (!ambiguous) pending.current = null; setUncertain(ambiguous); setError(creditError(failure)); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  function run(make: (key: string) => () => Promise<CreditCommandResult>) {
    if (!alive.current || inFlight.current || pending.current) return;
    pending.current = make(`credit-${randomUuid()}`); void execute(pending.current);
  }
  async function reconcileAndRetry(reconcile: () => Promise<unknown>) {
    if (!alive.current || inFlight.current || !pending.current) return;
    inFlight.current = true; setBusy(true);
    try { await reconcile(); } catch (failure) { if (alive.current) setError(creditError(failure)); return; }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
    if (alive.current && pending.current) await execute(pending.current);
  }
  return { busy, uncertain, error, run, reconcileAndRetry, setError };
}
