import { useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { MemorySessionStore } from "../lib/auth/session-store";
import { AuthFixtureClient } from "../lib/auth/fixtures";
import { CustomerOtpController } from "../lib/auth/ui";
import type { AuthApi } from "../lib/auth/api";
import { AuthContext } from "./auth-context";

/**
 * React shell around the CustomerOtpController.
 *
 * Defaults to the contract fixture client so the storefront can run/demo the
 * OTP flow before the auth backend endpoints land on `main` (parallel-work
 * model, AUTH_CONTRACT §17). Pass `api`/`store` overrides (e.g. the real
 * `AuthHttpClient`) when wiring against a deployed backend.
 */
export type AuthProviderProps = {
  children: ReactNode;
  api?: AuthApi;
  store?: MemorySessionStore;
};

/**
 * The storefront must never silently fall back to the in-memory fixture client
 * in a shipped build: AUTH_CONTRACT §17 only ever authorizes the fixture as a
 * pre-backend dev/demo stand-in, gated on `VITE_FIXTURE_AUTH=true` supplied
 * only in local dev and the e2e `fixture-e2e` build mode. In a production build
 * without the explicit opt-in, the default is fail-closed so a deployment
 * cannot ship a fake auth path by accident. Remove this guard when the real
 * `AuthHttpClient` is wired as part of #50.
 */
const fixtureAuthEnabled = import.meta.env.VITE_FIXTURE_AUTH === "true";

/**
 * Renders the storefront shell. A caller-supplied `api` (a real
 * `AuthHttpClient`, or an explicitly-authorized fixture) always wins; the bare
 * default is fail-closed unless `VITE_FIXTURE_AUTH=true` is set, so production
 * cannot demo-auth.
 */
export function AuthProvider({ children, api, store }: AuthProviderProps) {
  const value = useMemo(() => {
    if (!api && !fixtureAuthEnabled) {
      throw new Error(
        "AuthProvider: the fixture auth client is not enabled in this build. " +
          "Wire a real AuthHttpClient (docs/AUTH_CONTRACT.md §18) or set " +
          "VITE_FIXTURE_AUTH=true for local dev/e2e only.",
      );
    }
    const sessionStore = store ?? new MemorySessionStore();
    const client = api ?? new AuthFixtureClient({ store: sessionStore });
    const controller = new CustomerOtpController(client, sessionStore);
    return {
      state: controller.getState(),
      controller,
      open: () => controller.open(),
      close: () => controller.close(),
    };
    // api/store are intentionally considered stable; components re-create the
    // controller only when the provider remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshots = useSyncExternalStore(
    value.controller.subscribe.bind(value.controller),
    () => value.controller.getState(),
    () => value.controller.getState(),
  );

  const contextValue = useMemo(
    () => ({ ...value, state: snapshots }),
    [value, snapshots],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}
