import { describe, expect, it } from 'vitest';
import {
  civilKey, computeReturnDeadline, endOfTehranDay, isBusinessDay, isWithinReturnWindow, parseCivilKey, tehranCivilDate,
} from './return-window';

// Tehran is UTC+03:30 with no daylight saving after 2022.
const tehran = (iso: string) => new Date(`${iso}+03:30`);
const none: ReadonlySet<string> = new Set();

describe('Tehran calendar helpers', () => {
  it('uses the Tehran day, not the UTC day', () => {
    expect(civilKey(tehranCivilDate(new Date('2026-11-09T21:00:00Z')))).toBe('2026-11-10'); // 00:30 Tehran
    expect(civilKey(tehranCivilDate(new Date('2026-11-09T20:00:00Z')))).toBe('2026-11-09'); // 23:30 Tehran
  });

  it('ends a day at 23:59:59.999 Tehran time', () => {
    expect(endOfTehranDay({ year: 2026, month: 11, day: 9 }).toISOString()).toBe('2026-11-09T20:29:59.999Z');
  });

  it('parses only real calendar days', () => {
    expect(parseCivilKey('2026-11-09')).toEqual({ year: 2026, month: 11, day: 9 });
    expect(parseCivilKey('2026-02-30')).toBeNull();
    expect(parseCivilKey('2026-1-9')).toBeNull();
    expect(parseCivilKey('x')).toBeNull();
  });

  it('treats only Friday as the weekly day off', () => {
    const days = ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']; // Sat..Fri
    expect(days.map((day) => isBusinessDay(parseCivilKey(day)!, none))).toEqual([true, true, true, true, true, true, false]);
  });

  it('excludes listed holidays', () => {
    expect(isBusinessDay({ year: 2026, month: 11, day: 9 }, new Set(['2026-11-09']))).toBe(false);
  });
});

describe('in-person window: 2 business days', () => {
  it('issued on a Monday ends at the end of Wednesday', () => {
    const deadline = computeReturnDeadline({ kind: 'IN_PERSON', anchor: tehran('2026-11-09T10:00:00'), holidays: none }); // Mon
    expect(civilKey(tehranCivilDate(deadline))).toBe('2026-11-11');
    expect(deadline.toISOString()).toBe('2026-11-11T20:29:59.999Z');
  });

  it('skips Friday: issued Wednesday ends Saturday', () => {
    // Wed 11 -> Thu 12 (1), Fri 13 off, Sat 14 (2)
    const deadline = computeReturnDeadline({ kind: 'IN_PERSON', anchor: tehran('2026-11-11T09:00:00'), holidays: none });
    expect(civilKey(tehranCivilDate(deadline))).toBe('2026-11-14');
  });

  it('skips a listed holiday', () => {
    // Mon 9 -> Tue 10 holiday, Wed 11 (1), Thu 12 (2)
    const deadline = computeReturnDeadline({ kind: 'IN_PERSON', anchor: tehran('2026-11-09T09:00:00'), holidays: new Set(['2026-11-10']) });
    expect(civilKey(tehranCivilDate(deadline))).toBe('2026-11-12');
  });

  it('counts the issuing day as day zero even when it is a Friday', () => {
    // Fri 13 -> Sat 14 (1), Sun 15 (2)
    const deadline = computeReturnDeadline({ kind: 'IN_PERSON', anchor: tehran('2026-11-13T12:00:00'), holidays: none });
    expect(civilKey(tehranCivilDate(deadline))).toBe('2026-11-15');
  });

  it('uses the Tehran day of an invoice issued just after local midnight', () => {
    // 2026-11-09T21:00Z is 00:30 on Tue 10 in Tehran: day zero is Tuesday.
    const deadline = computeReturnDeadline({ kind: 'IN_PERSON', anchor: new Date('2026-11-09T21:00:00Z'), holidays: none });
    expect(civilKey(tehranCivilDate(deadline))).toBe('2026-11-12');
  });

  it('fails loudly instead of looping on an absurd holiday list', () => {
    const everyDay = new Set(Array.from({ length: 400 }, (_, i) => civilKey(tehranCivilDate(new Date(Date.UTC(2026, 10, 9 + i, 12))))));
    expect(() => computeReturnDeadline({ kind: 'IN_PERSON', anchor: tehran('2026-11-09T09:00:00'), holidays: everyDay })).toThrow();
  });
});

describe('shipped window: 7 calendar days', () => {
  it('ends at the end of day zero plus seven, regardless of holidays or Fridays', () => {
    const deadline = computeReturnDeadline({ kind: 'DELIVERY', anchor: tehran('2026-11-09T10:00:00'), holidays: new Set(['2026-11-12', '2026-11-13']) });
    expect(civilKey(tehranCivilDate(deadline))).toBe('2026-11-16');
    expect(deadline.toISOString()).toBe('2026-11-16T20:29:59.999Z');
  });
});

describe('window check', () => {
  const deadline = new Date('2026-11-11T20:29:59.999Z');
  it('is inclusive of the final millisecond and closed afterwards', () => {
    expect(isWithinReturnWindow(new Date('2026-11-11T20:29:59.999Z'), deadline)).toBe(true);
    expect(isWithinReturnWindow(new Date('2026-11-11T20:30:00.000Z'), deadline)).toBe(false);
  });
});
