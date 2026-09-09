import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { MemorySessionStore, CrossTabSessionBus } from "../lib/auth/session-store";
import { AuthFixtureClient } from "../lib/auth/fixtures";
import { AuthHttpClient } from "../lib/auth/api";
import { readCsrfCookie } from "../lib/auth/csrf";
import { CustomerOtpController } from "../lib/auth/ui";
import type { AuthApi } from "../lib/auth/api";
import { AuthContext } from "./auth-context";

/**
 * React shell around the CustomerOtpController.
 *
 * Defaults to the real `AuthHttpClient` (calls `/api/v1/auth/*` with the CSRF
 * and refresh cookies). The contract fixture client is only substituted for
 * local dev / the e2e `fixture-e2e` build when `VITE_FIXTURE_AUTH=true` is
 * baked into the build (parallel-work model, AUTH_CONTRACT §17).
 */
export type AuthProviderProps = {
  children: ReactNode;
  api?: AuthApi;
  store?: MemorySessionStore;
  bus?: CrossTabSessionBus;
};

/**
 * The storefront defaults to the real HTTP client. The in-memory fixture client
 * is only authorized as a dev/demo/e2e stand-in when `VITE_FIXTURE_AUTH=true` is
 * explicitly set, so a shipped build without the opt-in can never load a fake
 * auth path (AUTH_CONTRACT §17).
 */
const fixtureAuthEnabled = import.meta.env.VITE_FIXTURE_AUTH === "true";

/** Monotonic clock injected into the controller (module scope keeps render pure). */
const nowClock = (): number => Date.now();

/**
 * Renders the storefront shell. The real `AuthHttpClient` is the default; a
 * caller-supplied `api` (for tests) always wins; a fixture is used only when
 * `VITE_FIXTURE_AUTH=true` is set.
 */
export function AuthProvider({ children, api, store, bus }: AuthProviderProps) {
  const value = useMemo(() => {
    const sessionStore = store ?? new MemorySessionStore();
    const sessionBus = bus ?? new CrossTabSessionBus();
    const client =
      api ??
      (fixtureAuthEnabled
        ? new AuthFixtureClient({ store: sessionStore })
        : new AuthHttpClient({
            store: sessionStore,
            getCsrfToken: () => readCsrfCookie(window.document),
          }));
    const controller = new CustomerOtpController(client, sessionStore, nowClock, sessionBus);
    return {
      state: controller.getState(),
      controller,
      open: () => controller.open(),
      close: () => controller.close(),
    };
    // api/store/bus are intentionally considered stable; components re-create
    // the controller only when the provider remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshots = useSyncExternalStore(
    value.controller.subscribe.bind(value.controller),
    () => value.controller.getState(),
    () => value.controller.getState(),
  );

  const refreshRef = useRef(value.controller);

  useEffect(() => {
    // Silent single-flight restore: refresh has a live in-memory session exactly
    // once per page lifetime; on SESSION_INVALID/REPLAYED it latches and never
    // auto-retries (AUTH_CONTRACT §7 / #50 no-retry).
    void refreshRef.current.restoreSession();
  }, []);

  const contextValue = useMemo(
    () => ({ ...value, state: snapshots }),
    [value, snapshots],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}