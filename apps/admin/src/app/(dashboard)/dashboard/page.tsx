import { AlertTriangle, ArrowUpLeft, Boxes, PackageCheck, ReceiptText, ShoppingBag } from 'lucide-react';
import styles from './page.module.css';

const metrics = [
  {
    label: 'سفارش‌های امروز',
    value: '—',
    note: 'پس از اتصال API نمایش داده می‌شود',
    icon: ShoppingBag,
    tone: 'orange',
  },
  {
    label: 'در انتظار پردازش',
    value: '—',
    note: 'وضعیت سفارش از سرور خوانده می‌شود',
    icon: ReceiptText,
    tone: 'blue',
  },
  {
    label: 'موجودی کم',
    value: '—',
    note: 'بر اساس آستانهٔ هر انبار',
    icon: Boxes,
    tone: 'amber',
  },
  {
    label: 'آمادهٔ ارسال',
    value: '—',
    note: 'پس از تکمیل جریان fulfillment',
    icon: PackageCheck,
    tone: 'green',
  },
] as const;

const upcomingModules = [
  ['احراز هویت و سطح دسترسی', 'Sprint 1', 'در انتظار قرارداد'],
  ['کاتالوگ، کالا و SKU', 'Sprint 2', 'برنامه‌ریزی‌شده'],
  ['دفتر موجودی و انتقال', 'Sprint 4–5', 'برنامه‌ریزی‌شده'],
  ['سفارش و پرداخت', 'Sprint 7–8', 'برنامه‌ریزی‌شده'],
] as const;

export default function DashboardPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="dashboard-title">
        <div>
          <span className={styles.eyebrow}>مرکز عملیات</span>
          <h1 id="dashboard-title">صبح بخیر؛ وضعیت کسب‌وکار در یک نگاه</h1>
          <p>
            این داشبورد فعلاً پوستهٔ اجرایی است. هیچ عدد ساختگی به‌عنوان دادهٔ واقعی نمایش داده نمی‌شود
            و هر کارت همراه با API همان دامنه فعال خواهد شد.
          </p>
        </div>
        <div className={styles.releaseCard}>
          <span>نسخهٔ هدف</span>
          <strong>0.1 Foundation</strong>
          <small>مرحلهٔ آماده‌سازی زیرساخت و قراردادها</small>
        </div>
      </section>

      <section className={styles.metrics} aria-label="شاخص‌های کلیدی">
        {metrics.map(({ label, value, note, icon: Icon, tone }) => (
          <article className={styles.metricCard} key={label}>
            <div className={`${styles.metricIcon} ${styles[tone]}`} aria-hidden="true">
              <Icon size={21} strokeWidth={1.8} />
            </div>
            <div className={styles.metricCopy}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.panelEyebrow}>نقشهٔ اجرا</span>
              <h2>ماژول‌های پیش رو</h2>
            </div>
            <button type="button" disabled title="پس از اتصال مدیریت Issue فعال می‌شود">
              مشاهدهٔ برنامه <ArrowUpLeft size={16} />
            </button>
          </div>

          <div className={styles.moduleList}>
            {upcomingModules.map(([name, sprint, status]) => (
              <div className={styles.moduleRow} key={name}>
                <span className={styles.moduleMarker} aria-hidden="true" />
                <strong>{name}</strong>
                <span>{sprint}</span>
                <small>{status}</small>
              </div>
            ))}
          </div>
        </article>

        <aside className={`${styles.panel} ${styles.attentionPanel}`}>
          <div className={styles.attentionIcon} aria-hidden="true">
            <AlertTriangle size={23} />
          </div>
          <span className={styles.panelEyebrow}>نیازمند تصمیم تیم</span>
          <h2>قبل از نمایش دادهٔ واقعی</h2>
          <ul>
            <li>قرارداد شاخص‌های داشبورد و سطح دسترسی</li>
            <li>واحد قطعی پول و شیوهٔ نمایش تومان/ریال</li>
            <li>سیاست تخصیص موجودی میان انبارها</li>
            <li>تعریف SLA سفارش‌های معطل و هشدارها</li>
          </ul>
          <p>تصمیم‌های تأییدنشده در UI به قانون کسب‌وکار تبدیل نمی‌شوند.</p>
        </aside>
      </section>
    </div>
  );
}
