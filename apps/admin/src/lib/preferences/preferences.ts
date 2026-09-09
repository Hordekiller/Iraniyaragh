/**
 * Admin panel presentation preferences.
 *
 * Pure module: types, defaults, validation and (de)serialization of the
 * non-secret `iraniyaragh_admin_prefs` cookie. It deliberately holds no
 * credentials or session data — only display prefs (theme mode, skin,
 * layout type and content width).
 *
 * Design reference: Vuexy "customizer" controls (mode / skin / layout /
 * content width). The set is deliberately small so the admin stays
 * predictable and testable.
 */

export type AdminMode = 'light' | 'dark' | 'system';
export type AdminSkin = 'default' | 'bordered';
export type AdminLayoutType = 'vertical' | 'horizontal';
export type ContentWidth = 'fluid' | 'boxed';

export type AdminPreferences = {
  /** Color mode. `system` follows the OS via `prefers-color-scheme`. */
  mode: AdminMode;
  /** Surface treatment: elevated cards vs. bordered outlines. */
  skin: AdminSkin;
  /** Vertical (sidebar) or horizontal (top nav) application frame. */
  layout: AdminLayoutType;
  /** Fluid full-width workspace or centered boxed workspace. */
  contentWidth: ContentWidth;
  /** Persisted desktop mini-sidebar state; ignored by horizontal/mobile layouts. */
  navCollapsed: boolean;
};

export const ADMIN_PREFS_COOKIE = 'iraniyaragh_admin_prefs';

export const defaultPreferences: AdminPreferences = {
  mode: 'light',
  skin: 'default',
  layout: 'vertical',
  contentWidth: 'fluid',
  navCollapsed: false,
};

const MODES: readonly AdminMode[] = ['light', 'dark', 'system'];
const SKINS: readonly AdminSkin[] = ['default', 'bordered'];
const LAYOUTS: readonly AdminLayoutType[] = ['vertical', 'horizontal'];
const WIDTHS: readonly ContentWidth[] = ['fluid', 'boxed'];

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return allowed.includes(value as T);
}

export function resolveMode(
  mode: AdminMode,
  systemPrefersDark: boolean,
): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light';
  return mode;
}

export function serializePreferences(prefs: AdminPreferences): string {
  return JSON.stringify(prefs);
}

/**
 * Parse and validate a raw cookie value. Unknown or malformed values fall
 * back to `defaultPreferences` per-field so a corrupted cookie never
 * breaks the panel.
 */
export function parsePreferencesCookie(
  raw: string | undefined | null,
): AdminPreferences {
  if (!raw) return defaultPreferences;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaultPreferences;
    }
    const candidate = parsed as Record<string, unknown>;
    return {
      mode: isOneOf(candidate.mode, MODES)
        ? candidate.mode
        : defaultPreferences.mode,
      skin: isOneOf(candidate.skin, SKINS)
        ? candidate.skin
        : defaultPreferences.skin,
      layout: isOneOf(candidate.layout, LAYOUTS)
        ? candidate.layout
        : defaultPreferences.layout,
      contentWidth: isOneOf(candidate.contentWidth, WIDTHS)
        ? candidate.contentWidth
        : defaultPreferences.contentWidth,
      navCollapsed:
        typeof candidate.navCollapsed === 'boolean'
          ? candidate.navCollapsed
          : defaultPreferences.navCollapsed,
    };
  } catch {
    return defaultPreferences;
  }
}
