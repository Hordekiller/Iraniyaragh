/**
 * Return window policy (owner-approved, revision `returns-v1`).
 *
 * - The clock starts when the order's store invoice was issued (day 0 is the
 *   Tehran calendar day of issuance).
 * - In-person handover: 2 business days after day 0. A business day is
 *   Saturday–Thursday and not an officially listed holiday. Friday is off.
 * - Shipped to another city: 7 full calendar days after day 0 (holidays do not
 *   extend it).
 * - The window ends at the very end (23:59:59.999, Asia/Tehran) of its last day.
 *
 * Everything here is pure: the caller supplies the instant, the classification
 * and the holiday set, so the same inputs always produce the same deadline.
 */
export const RETURN_POLICY_REVISION = 'returns-v1';
export const RETURN_BUSINESS_DAYS_IN_PERSON = 2;
export const RETURN_CALENDAR_DAYS_DELIVERY = 7;
export const RETURN_TIME_ZONE = 'Asia/Tehran';

export type ReturnWindowKind = 'IN_PERSON' | 'DELIVERY';

type Civil = { year: number; month: number; day: number };
const MS_PER_DAY = 86_400_000;
const MAX_SCAN_DAYS = 60;

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: RETURN_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function wallClock(instant: Date) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

/** Tehran calendar day of an instant. */
export function tehranCivilDate(instant: Date): Civil {
  const { year, month, day } = wallClock(instant);
  return { year, month, day };
}

export function civilKey({ year, month, day }: Civil): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Strict `YYYY-MM-DD` of a real calendar day, otherwise null. */
export function parseCivilKey(value: string): Civil | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const civil = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const probe = new Date(Date.UTC(civil.year, civil.month - 1, civil.day));
  const valid = probe.getUTCFullYear() === civil.year && probe.getUTCMonth() === civil.month - 1 && probe.getUTCDate() === civil.day;
  return valid ? civil : null;
}

function addDays(civil: Civil, days: number): Civil {
  const moved = new Date(Date.UTC(civil.year, civil.month - 1, civil.day) + days * MS_PER_DAY);
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/** Friday is the only weekly day off; Saturday–Thursday are working days. */
export function isWeeklyDayOff(civil: Civil): boolean {
  return new Date(Date.UTC(civil.year, civil.month - 1, civil.day)).getUTCDay() === 5;
}

export function isBusinessDay(civil: Civil, holidays: ReadonlySet<string>): boolean {
  return !isWeeklyDayOff(civil) && !holidays.has(civilKey(civil));
}

function offsetMinutes(instant: Date): number {
  const wall = wallClock(instant);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** The instant at which the Tehran wall clock reads the given civil date and time. */
function tehranInstant(civil: Civil, hour: number, minute: number, second: number, millisecond: number): Date {
  const naive = Date.UTC(civil.year, civil.month - 1, civil.day, hour, minute, second, millisecond);
  const first = naive - offsetMinutes(new Date(naive)) * 60_000;
  return new Date(naive - offsetMinutes(new Date(first)) * 60_000);
}

export function endOfTehranDay(civil: Civil): Date {
  return tehranInstant(civil, 23, 59, 59, 999);
}

export function computeReturnDeadline(input: {
  kind: ReturnWindowKind;
  /** Instant the store invoice was issued. */
  anchor: Date;
  holidays: ReadonlySet<string>;
}): Date {
  const dayZero = tehranCivilDate(input.anchor);
  if (input.kind === 'DELIVERY') return endOfTehranDay(addDays(dayZero, RETURN_CALENDAR_DAYS_DELIVERY));
  let current = dayZero;
  let counted = 0;
  for (let scanned = 0; counted < RETURN_BUSINESS_DAYS_IN_PERSON; scanned += 1) {
    if (scanned >= MAX_SCAN_DAYS) throw new Error('Return deadline could not be resolved: too many consecutive non-business days.');
    current = addDays(current, 1);
    if (isBusinessDay(current, input.holidays)) counted += 1;
  }
  return endOfTehranDay(current);
}

export function isWithinReturnWindow(now: Date, deadline: Date): boolean {
  return now.getTime() <= deadline.getTime();
}
