'use client';

import type { DashboardStatusCount } from '@iranyaragh/contracts';
import { Card, CardContent, Typography } from '@mui/material';
import {
  dashboardStatusLabel,
  formatCount,
  type DashboardStatus,
} from '@/lib/dashboard/dashboard-format';
import styles from './DashboardView.module.css';

type StatusBreakdownCardProps<TStatus extends DashboardStatus> = {
  id: string;
  title: string;
  description: string;
  items: DashboardStatusCount<TStatus>[];
};

export function StatusBreakdownCard<TStatus extends DashboardStatus>({
  id,
  title,
  description,
  items,
}: StatusBreakdownCardProps<TStatus>) {
  const maximum = Math.max(1, ...items.map(({ count }) => count));
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card component="section" aria-labelledby={`${id}-title`} sx={{ height: '100%' }}>
      <CardContent className={styles.breakdownCard}>
        <div className={styles.cardHeading}>
          <div>
            <Typography component="h2" variant="h6" id={`${id}-title`}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {description}
            </Typography>
          </div>
          <div className={styles.totalBadge} aria-label={`مجموع ${formatCount(total)}`}>
            <strong>{formatCount(total)}</strong>
            <span>مجموع</span>
          </div>
        </div>

        <div className={styles.barChart} aria-label={`نمودار ${title}`}>
          {items.map(({ status, count }, index) => (
            <div className={styles.barRow} key={status}>
              <div className={styles.barLabels}>
                <span>{dashboardStatusLabel(status)}</span>
                <strong>{formatCount(count)}</strong>
              </div>
              <div className={styles.barTrack} aria-hidden="true">
                <span
                  className={`${styles.barFill} ${styles[`barTone${index % 5}`]}`}
                  style={{ width: `${(count / maximum) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <details className={styles.dataTableDisclosure}>
          <summary>مشاهدهٔ جدول داده</summary>
          <div className={styles.tableScroll}>
            <table>
              <caption>{`جدول ${title}`}</caption>
              <thead>
                <tr>
                  <th scope="col">وضعیت</th>
                  <th scope="col">تعداد</th>
                </tr>
              </thead>
              <tbody>
                {items.map(({ status, count }) => (
                  <tr key={status}>
                    <th scope="row">{dashboardStatusLabel(status)}</th>
                    <td>{formatCount(count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
