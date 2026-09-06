let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Returns a fresh, page-scoped in-memory token store for the staff login slice
 * (#50). Unlike the module-global `token-store` above, this one is constructed
 * per `StaffLoginController` so challenge/access state stays strictly memory-only
 * and never touches localStorage/sessionStorage (decision B; AUTH_CONTRACT §17).
 */
export function createMemoryStaffTokenStore(): {
  get(): string | null;
  set(token: string | null): void;
} {
  let current: string | null = null;
  return {
    get() {
      return current;
    },
    set(token: string | null) {
      current = token;
    },
  };
}
