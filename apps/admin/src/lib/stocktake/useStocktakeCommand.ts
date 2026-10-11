'use client';

import { useRef, useState } from 'react';
import type { StocktakeDetail } from '@iranyaragh/contracts';
import { newStocktakeCommandKey } from './stocktake-api';
import { stocktakeError, stocktakeOutcomeIsUncertain } from './stocktake-errors';

/** Capture the payload and key together; no new command after an ambiguous send. */
export function useStocktakeCommand(onSaved: (detail: StocktakeDetail) => void) {
  const inFlight = useRef(false);
  const pending = useRef<(() => Promise<StocktakeDetail>) | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function execute(request: () => Promise<StocktakeDetail>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      const detail = await request();
      pending.current = null; setUncertain(false);
      onSaved(detail);
    } catch (failure) {
      const ambiguous = stocktakeOutcomeIsUncertain(failure);
      if (!ambiguous) pending.current = null;
      setUncertain(ambiguous); setError(stocktakeError(failure));
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }

  function run(makeRequest: (key: string) => () => Promise<StocktakeDetail>) {
    if (inFlight.current || pending.current) return;
    pending.current = makeRequest(newStocktakeCommandKey());
    void execute(pending.current);
  }

  async function reconcileAndRetry(reconcile: () => Promise<unknown>) {
    if (inFlight.current || !pending.current) return;
    inFlight.current = true; setBusy(true);
    try { await reconcile(); }
    catch (failure) { setError(stocktakeError(failure)); return; }
    finally { inFlight.current = false; setBusy(false); }
    if (pending.current) await execute(pending.current);
  }

  return { busy, uncertain, error, run, reconcileAndRetry, setError };
}
