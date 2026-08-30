'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Bell, ChevronLeft, Menu, Search, X } from 'lucide-react';
import { navigation } from '@/config/navigation';
import styles from './AdminShell.module.css';

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarOpen : ''}`} aria-label="منوی اصلی">
        <div className={styles.brand}>
          <div className={styles.brandMark} aria-hidden="true">
            آی
          </div>
          <div>
            <strong>ایران یراق</strong>
            <span>مرکز عملیات</span>
          </div>
          <button className={styles.closeMenu} onClick={() => setMobileMenuOpen(false)} type="button" aria-label="بستن منو">
            <X size={20} />
          </button>
        </div>

        <nav className={styles.navigation}>
          {navigation.map(group => (
            <div className={styles.navGroup} key={group.label}>
              <span className={styles.groupLabel}>{group.label}</span>
              {group.items.map(item => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

                if (item.status === 'planned') {
                  return (
                    <span className={`${styles.navItem} ${styles.planned}`} key={item.href} aria-disabled="true">
                      <Icon size={18} strokeWidth={1.8} />
                      <span>{item.label}</span>
                      <small>به‌زودی</small>
                    </span>
                  );
                }

                return (
                  <Link
                    className={`${styles.navItem} ${active ? styles.active : ''}`}
                    href={item.href}
                    key={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{item.label}</span>
                    <ChevronLeft className={styles.navArrow} size={15} />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <span>نسخهٔ پایه</span>
          <strong>v0.1.0</strong>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button className={styles.backdrop} type="button" aria-label="بستن منو" onClick={() => setMobileMenuOpen(false)} />
      )}

      <div className={styles.workspace}>
        <header className={styles.header}>
          <div className={styles.headerStart}>
            <button className={styles.menuButton} type="button" aria-label="باز کردن منو" onClick={() => setMobileMenuOpen(true)}>
              <Menu size={21} />
            </button>
            <div className={styles.searchBox}>
              <Search size={18} aria-hidden="true" />
              <label className={styles.visuallyHidden} htmlFor="admin-search">
                جستجو در پنل
              </label>
              <input id="admin-search" placeholder="جستجو در سفارش، کالا یا مشتری…" disabled />
              <kbd>⌘ K</kbd>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button type="button" aria-label="اعلان‌ها" disabled>
              <Bell size={19} />
              <span className={styles.notificationDot} />
            </button>
            <div className={styles.profile}>
              <div className={styles.avatar} aria-hidden="true">
                م
              </div>
              <div>
                <strong>مدیر سیستم</strong>
                <span>حساب آزمایشی</span>
              </div>
            </div>
          </div>
        </header>

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
