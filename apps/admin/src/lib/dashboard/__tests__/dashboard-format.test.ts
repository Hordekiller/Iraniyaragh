import { describe, expect, it } from 'vitest';
import {
  dashboardStatusLabel,
  formatCount,
  formatDashboardRange,
  formatIranDateTime,
  formatIrr,
} from '../dashboard-format';

describe('dashboard-format', () => {
  it('formats arbitrary precision rial strings without coercing them to Number', () => {
    expect(formatIrr('900719925474099312345')).toBe('۹۰۰٬۷۱۹٬۹۲۵٬۴۷۴٬۰۹۹٬۳۱۲٬۳۴۵ ریال');
  });

  it('uses Persian labels and digits for factual counts', () => {
    expect(dashboardStatusLabel('PARTIALLY_REFUNDED')).toBe('بازپرداخت جزئی');
    expect(dashboardStatusLabel('IN_TRANSIT')).toBe('در مسیر');
    expect(formatCount(1234)).toBe('۱٬۲۳۴');
  });

  it('renders instants and range boundaries in the declared Iran timezone', () => {
    const instant = formatIranDateTime('2026-03-21T00:00:00.000Z');
    expect(instant).toContain('۱۴۰۵');
    expect(formatDashboardRange('2026-03-21T00:00:00.000Z', '2026-03-22T00:00:00.000Z'))
      .toContain(' تا ');
  });
});
