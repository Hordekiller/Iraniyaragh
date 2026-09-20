import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import styles from './AuthSurface.module.css';

type AuthSurfaceProps = {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
};

export function AuthSurface({
  title,
  description,
  footer,
  children,
}: AuthSurfaceProps) {
  return (
    <div className={styles.surface}>
      <a className={styles.skipLink} href="#auth-main-content">
        پرش به فرم ورود
      </a>
      <aside className={styles.story} aria-label="معرفی پنل عملیات">
        <div className={styles.storyContent}>
          <BrandLogo inverse />
          <div className={styles.storyCopy}>
            <span className={styles.eyebrow}>پنل یکپارچه عملیات</span>
            <h2>کنترل دقیق، تصمیم مطمئن</h2>
            <p>
              کاتالوگ، موجودی، سفارش و تنظیمات عملیاتی در یک محیط امن، پاسخ‌گو و
              راست‌به‌چپ مدیریت می‌شوند.
            </p>
          </div>
          <span className={styles.storyMeta}>دارایی‌ها و قلم‌ها کاملاً محلی هستند</span>
        </div>
      </aside>
      <main className={styles.panel} id="auth-main-content" tabIndex={-1}>
        <div className={styles.card}>
          <BrandLogo />
          <header className={styles.heading}>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          {children}
          <footer className={styles.footer}>{footer}</footer>
        </div>
      </main>
    </div>
  );
}
