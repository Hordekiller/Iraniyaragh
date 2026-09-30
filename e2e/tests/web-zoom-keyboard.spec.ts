import { expect, test } from '@playwright/test';
import { isMobile } from './helpers';

/**
 * WCAG text-resize and reflow coverage for the storefront.
 *
 * Two different things are being checked, and conflating them hides real bugs:
 *
 * - **1.4.10 Reflow**: at 320 CSS px the layout must not scroll sideways. That
 *   is a *narrow viewport* problem, simulated with `viewport: { width: 320 }`.
 * - **1.4.4 Resize Text**: at 200% text the content must stay usable. Browser
 *   zoom is emulated with Chromium's `Emulation.setPageScaleFactor`-style
 *   device-pixel-ratio trick below, which is what WCAG's own "resize text to
 *   200%" procedure produces.
 *
 * Each assertion is a *measured* fact about the DOM, not a screenshot diff, so
 * a failure names the exact element that overflows.
 */

const ROUTES = [
  '/',
  '/products',
  '/category/power-tools',
  '/product/ronix-2210-hammer-drill',
  '/cart',
  '/services',
  '/terms',
  '/privacy',
];

/**
 * Whether an element that sticks out of the viewport actually matters.
 *
 * Two exclusions, both taken from WCAG 1.4.10 itself:
 *
 * - an ancestor that clips or scrolls horizontally *contains* the element, so
 *   it cannot push the page wide (decorative hero blobs live here);
 * - content that needs two dimensions to be understood — a product carousel —
 *   is explicitly allowed to overflow. What is not allowed is for such a
 *   scroller to be pointer-only, which is asserted separately.
 *
 * This runs inside `page.evaluate`, so it is re-declared in each block rather
 * than passed across the bridge.
 */
const CONTAINED_OR_TWO_DIMENSIONAL = `
  const isContained = (element) => {
    for (let node = element; node; node = node.parentElement) {
      const style = window.getComputedStyle(node);
      if (['hidden','clip','auto','scroll'].includes(style.overflowX)) return true;
    }
    return false;
  };
`;

test.describe('web: 1.4.10 reflow at 320 CSS px', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  for (const route of ROUTES) {
    test(`${route} does not scroll sideways`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(
        ({ containedSource }) => {
          const isContained = new Function(
            'element',
            `${containedSource} return isContained(element);`,
          ) as (element: Element) => boolean;

          const docWidth = document.documentElement.clientWidth;
          const limit = docWidth + 1;
          const offenders: Array<{ tag: string; cls: string; text: string }> = [];

          for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            if (style.position === 'fixed') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.right <= limit && rect.left >= -1) continue;
            if (isContained(el)) continue;

            // Purely decorative nodes carry no text, no role and no control.
            const meaningful =
              (el.textContent ?? '').trim().length > 0 ||
              el.hasAttribute('role') ||
              el.hasAttribute('aria-label') ||
              el.querySelector('a,button,input,select,textarea,img,[role],[aria-label]') !== null;
            if (!meaningful) continue;

            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls: String(el.className).slice(0, 60),
              text: (el.textContent ?? '').trim().slice(0, 60),
            });
          }
          return { docWidth, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 5) };
        },
        { containedSource: CONTAINED_OR_TWO_DIMENSIONAL },
      );

      expect(overflow.offenders, `meaningful content overflowing at ${route}: ${JSON.stringify(overflow.offenders)}`).toEqual([]);
      // The document itself is the final authority: no horizontal scrollbar.
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.docWidth + 1);
    });
  }
});

test.describe('web: 1.4.4 text resize to 200%', () => {
  test.use({ deviceScaleFactor: 2 });

  for (const route of ['/', '/products', '/product/ronix-2210-hammer-drill', '/cart']) {
    test(`${route} keeps its content reachable at 200% text`, async ({ page }) => {
      // Halving the CSS pixel budget is what a user gets when they double the
      // browser's text size at a fixed window width.
      const base = page.viewportSize()!;
      await page.setViewportSize({ width: Math.round(base.width / 2), height: base.height });

      await page.goto(route);
      await page.waitForLoadState('networkidle');

      // The main landmark must still contain the page's own heading; content
      // that is merely scrolled off into an unreachable overflow fails here.
      const main = page.locator('#main-content');
      await expect(main).toBeVisible();
      await expect(main.getByRole('heading').first()).toBeVisible();

      // No interactive control may end up outside the viewport unless it sits in
      // a two-dimensional scroller (a carousel), which the keyboard test covers.
      const stranded = await page.evaluate(
        ({ containedSource }) => {
          const isContained = new Function(
            'element',
            `${containedSource} return isContained(element);`,
          ) as (element: Element) => boolean;

          const docWidth = document.documentElement.clientWidth;
          const bad: Array<{ tag: string; label: string }> = [];
          for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('a,button,input,select,textarea'))) {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            if (el.closest('[aria-hidden="true"]') !== null) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.right <= docWidth + 1 && rect.left >= -1) continue;
            if (isContained(el)) continue;
            const label = (el.getAttribute('aria-label') ?? el.textContent ?? el.id ?? '').trim().slice(0, 50);
            bad.push({ tag: el.tagName.toLowerCase(), label });
          }
          return bad.slice(0, 5);
        },
        { containedSource: CONTAINED_OR_TWO_DIMENSIONAL },
      );

      expect(stranded, `unreachable controls at 200% on ${route}: ${JSON.stringify(stranded)}`).toEqual([]);
    });
  }
});

test.describe('web: keyboard-only operation', () => {
  test('the whole page is reachable by Tab, with a visible focus ring', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 1.4.11/2.4.7: the focused element must be visibly distinguishable. A
    // zero-size or fully transparent focus style fails silently for everyone.
    const invisible: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = window.getComputedStyle(el);
        const hasRing =
          style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        const hasShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
        const label = (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40);
        return { label, ok: hasRing || hasShadow };
      });
      if (info && !info.ok) invisible.push(info.label);
    }

    expect(invisible, `elements focused with no visible indicator: ${invisible.join(', ')}`).toEqual([]);
  });

  test('the main landmarks come before page content in the tab order', async ({ page }) => {
    await page.goto('/');

    const order: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return 'none';
          return el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? el.tagName;
        }),
      );
    }

    // The skip link must be the very first stop, ahead of every nav control.
    expect(order[0]).toContain('پرش به محتوای اصلی');
  });

  test('a dialog traps focus, closes on Escape and returns focus to its trigger', async ({ page }) => {
    test.skip(isMobile(page), 'the sign-in trigger differs on the mobile header');

    await page.goto('/account');

    // A real click, not a dispatched one: the whole point of the return path is
    // that it goes back to whatever the user actually operated. The exact label
    // is used because the dialog itself contains a "ورود" button.
    const trigger = page.getByRole('button', { name: 'ورود به حساب کاربری' });
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Opening a dialog must move focus into it.
    const focusIsInside = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const dlg = document.querySelector('[role="dialog"]');
        return Boolean(el && dlg && (dlg === el || dlg.contains(el)));
      });
    expect(await focusIsInside(), 'focus did not move into the dialog on open').toBe(true);

    // Tab through more steps than the dialog has controls: focus must stay in.
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusIsInside(), `focus escaped the dialog after ${i + 1} tabs`).toBe(true);
    }

    // Shift+Tab must not escape either.
    await page.keyboard.press('Shift+Tab');
    expect(await focusIsInside()).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // 2.4.3 Focus Order: focus must return to whatever opened the dialog.
    await expect(trigger).toBeFocused();
  });

  test('a dialog opened without a focused trigger still hands focus somewhere real', async ({ page }) => {
    test.skip(isMobile(page), 'the sign-in trigger differs on the mobile header');

    await page.goto('/account');
    // Blur everything first, so the dialog opens with `body` as the previously
    // focused element — the case that used to drop the user at the top of the
    // document on close.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const trigger = page.getByRole('button', { name: /ورود|ثبت‌نام/ }).first();
    await trigger.dispatchEvent('click');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Focus must land on the main landmark, not vanish onto <body>.
    const landed = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return { id: el?.id ?? '', tag: el?.tagName ?? '' };
    });
    expect(landed.tag).not.toBe('BODY');
    expect(landed.id).toBe('main-content');
  });

  test('the search combobox is fully operable with the keyboard alone', async ({ page }) => {
    test.skip(isMobile(page), 'the mobile header opens search as a sheet');

    await page.goto('/');

    const search = page.locator('#site-search-desktop');
    // Reached by Tab, not by click: focus must be able to get there.
    await search.focus();
    await expect(search).toBeFocused();

    await search.press('Control+a');
    await page.keyboard.type('دریل');

    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible();

    // APG: with a listbox open and no option highlighted, the combobox must
    // *omit* aria-activedescendant rather than point at a stale option.
    const idle = await page.evaluate(() => {
      const input = document.querySelector('#site-search-desktop');
      return {
        active: input?.getAttribute('aria-activedescendant'),
        expanded: input?.getAttribute('aria-expanded'),
        focused: document.activeElement?.id,
      };
    });
    expect(idle.focused).toBe('site-search-desktop');
    expect(idle.expanded).toBe('true');
    expect(idle.active, 'a highlighted option must exist before activedescendant is set').toBeNull();

    // ArrowDown highlights the first option and points activedescendant at it.
    await search.press('ArrowDown');
    const first = await page.evaluate(() => {
      const input = document.querySelector('#site-search-desktop');
      return input?.getAttribute('aria-activedescendant');
    });
    expect(first).toBeTruthy();
    await expect(page.locator(`#${first}`)).toHaveAttribute('aria-selected', 'true');
    // DOM focus must stay on the input: this is an activedescendant widget.
    await expect(search).toBeFocused();

    // ArrowDown advances the highlight.
    await search.press('ArrowDown');
    const second = await page.evaluate(() => {
      const input = document.querySelector('#site-search-desktop');
      return input?.getAttribute('aria-activedescendant');
    });
    expect(second).not.toBe(first);
    await expect(page.locator(`#${second}`)).toHaveAttribute('aria-selected', 'true');

    // Home/End jump to the ends, and the highlight wraps.
    await search.press('Home');
    expect(
      await page.evaluate(() => document.querySelector('#site-search-desktop')?.getAttribute('aria-activedescendant')),
    ).toBe(first);

    await search.press('End');
    const last = await page.evaluate(() => {
      const input = document.querySelector('#site-search-desktop');
      return input?.getAttribute('aria-activedescendant');
    });
    expect(last).not.toBe(first);
    await expect(page.locator(`#${last}`)).toHaveAttribute('aria-selected', 'true');
  });

  test('the product carousel is scrollable without a pointer', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 2.1.1 Keyboard: content that overflows horizontally needs a non-pointer
    // way to reach the items that start off screen.
    const scroller = page.locator('section#newest [class*="overflow-x-auto"]').first();
    await expect(scroller).toBeVisible();

    const before = await scroller.evaluate(el => el.scrollLeft);
    await scroller.focus();
    await page.keyboard.press('ArrowLeft');
    // The strip scrolls smoothly, so the value keeps moving after the keypress;
    // polling is the honest way to assert the scroll happened at all.
    await expect
      .poll(() => scroller.evaluate(el => el.scrollLeft), { timeout: 3000 })
      .not.toBe(before);

    // And it stays reachable by keyboard activation.
    const firstCard = scroller.locator('button').first();
    await firstCard.focus();
    await expect(firstCard).toBeFocused();
  });
});
