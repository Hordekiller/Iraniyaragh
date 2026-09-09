import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AdminPreferencesProvider,
  useAdminPreferences,
} from '../AdminPreferencesProvider';
import {
  defaultPreferences,
  ADMIN_PREFS_COOKIE,
  serializePreferences,
} from '../preferences';

function Probe() {
  const { prefs, resolvedMode, updatePrefs, resetPrefs } =
    useAdminPreferences();
  return (
    <div>
      <output data-testid="mode">{prefs.mode}</output>
      <output data-testid="resolved">{resolvedMode}</output>
      <output data-testid="skin">{prefs.skin}</output>
      <output data-testid="layout">{prefs.layout}</output>
      <output data-testid="collapsed">{String(prefs.navCollapsed)}</output>
      <button onClick={() => updatePrefs({ mode: 'dark', skin: 'bordered' })}>
        به تاریک برو
      </button>
      <button onClick={() => updatePrefs({ layout: 'horizontal' })}>
        افقی شو
      </button>
      <button onClick={() => updatePrefs({ navCollapsed: true })}>
        منو را جمع کن
      </button>
      <button onClick={resetPrefs}>بازنشانی</button>
    </div>
  );
}

function renderProvider(initialPrefs = defaultPreferences) {
  return render(
    <AdminPreferencesProvider initialPrefs={initialPrefs}>
      <Probe />
    </AdminPreferencesProvider>,
  );
}

describe('AdminPreferencesProvider', () => {
  it('initializes from server-seeded preferences', () => {
    renderProvider({
      ...defaultPreferences,
      mode: 'dark',
      contentWidth: 'boxed',
    });
    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
  });

  it('updates prefs and mirrors them onto the document root', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'به تاریک برو' }));

    await waitFor(() => {
      expect(document.documentElement.dataset.adminMode).toBe('dark');
      expect(document.documentElement.dataset.adminSkin).toBe('bordered');
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
  });

  it('switches to the horizontal layout preference', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'افقی شو' }));

    await waitFor(() => {
      expect(document.documentElement.dataset.adminLayout).toBe('horizontal');
    });
    expect(screen.getByTestId('layout')).toHaveTextContent('horizontal');
  });

  it('persists preferences to a non-secret cookie', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'به تاریک برو' }));

    await waitFor(() => {
      expect(document.cookie).toContain(ADMIN_PREFS_COOKIE);
    });
    const expected = serializePreferences({
      ...defaultPreferences,
      mode: 'dark',
      skin: 'bordered',
    });
    expect(document.cookie).toContain(encodeURIComponent(expected));
  });

  it('restores defaults via reset', async () => {
    renderProvider({ ...defaultPreferences, mode: 'dark' });
    expect(screen.getByTestId('mode')).toHaveTextContent('dark');

    fireEvent.click(screen.getByRole('button', { name: 'بازنشانی' }));
    expect(screen.getByTestId('mode')).toHaveTextContent('light');

    await waitFor(() => {
      expect(document.documentElement.dataset.adminMode).toBe('light');
    });
  });

  it('throws when used outside the provider', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(
      /must be used within an AdminPreferencesProvider/,
    );
    consoleError.mockRestore();
  });
});
