import { describe, expect, it } from 'vitest';
import {
  defaultPreferences,
  parsePreferencesCookie,
  resolveMode,
  serializePreferences,
} from '../preferences';

describe('preferences (pure)', () => {
  it('serializes and parses a full preferences object', () => {
    const prefs = {
      mode: 'dark' as const,
      skin: 'bordered' as const,
      layout: 'horizontal' as const,
      contentWidth: 'boxed' as const,
    };
    expect(parsePreferencesCookie(serializePreferences(prefs))).toEqual(prefs);
  });

  it('returns defaults for an empty cookie', () => {
    expect(parsePreferencesCookie(undefined)).toEqual(defaultPreferences);
    expect(parsePreferencesCookie('')).toEqual(defaultPreferences);
  });

  it('returns defaults for malformed JSON', () => {
    expect(parsePreferencesCookie('{not-json')).toEqual(defaultPreferences);
  });

  it('falls back per-field for invalid values instead of crashing', () => {
    const parsed = parsePreferencesCookie('{"mode":"neon","skin":"bordered","layout":"vertical","contentWidth":"fluid"}');
    expect(parsed).toEqual({
      mode: 'light',
      skin: 'bordered',
      layout: 'vertical',
      contentWidth: 'fluid',
    });
  });

  it('resolves explicit modes without a media query', () => {
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });

  it('resolves the system mode from the OS preference', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
  });
});