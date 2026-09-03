'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Snackbar, type AlertColor } from '@mui/material';

type FeedbackKind = AlertColor;

export type FeedbackOptions = {
  duration?: number;
  /** Vertical anchor. Defaults to bottom (RTL-aware via the Snackbar origin). */
  placement?: 'top' | 'bottom';
};

type FeedbackItem = {
  id: number;
  kind: FeedbackKind;
  message: string;
  duration: number;
  placement: 'top' | 'bottom';
};

type FeedbackContextValue = {
  show: (kind: FeedbackKind, message: string, options?: FeedbackOptions) => void;
  success: (message: string, options?: FeedbackOptions) => void;
  error: (message: string, options?: FeedbackOptions) => void;
  info: (message: string, options?: FeedbackOptions) => void;
  warning: (message: string, options?: FeedbackOptions) => void;
};

const defaultDuration = 4000;

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used within a <FeedbackProvider>.');
  }
  return ctx;
}

export function FeedbackProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [queue, setQueue] = useState<FeedbackItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((kind: FeedbackKind, message: string, options?: FeedbackOptions) => {
    idRef.current += 1;
    const item: FeedbackItem = {
      id: idRef.current,
      kind,
      message,
      duration: options?.duration ?? defaultDuration,
      placement: options?.placement ?? 'bottom',
    };
    setQueue((q) => [...q, item]);
  }, []);

  const dismiss = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  const active = queue[0] ?? null;

  const value = useMemo<FeedbackContextValue>(
    () => ({
      show: push,
      success: (m, o) => push('success', m, o),
      error: (m, o) => push('error', m, o),
      info: (m, o) => push('info', m, o),
      warning: (m, o) => push('warning', m, o),
    }),
    [push],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Snackbar
        key={active?.id}
        open={active !== null}
        autoHideDuration={active?.duration}
        onClose={() => dismiss()}
        anchorOrigin={{ vertical: active?.placement ?? 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setQueue((q) => q.slice(1))}
          severity={active?.kind ?? 'info'}
          role="status"
          sx={{ width: '100%', minWidth: 280, '& .MuiAlert-message': { textAlign: 'start' } }}
        >
          {active?.message}
        </Alert>
      </Snackbar>
    </FeedbackContext.Provider>
  );
}
