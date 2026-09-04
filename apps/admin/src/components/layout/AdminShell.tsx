'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronLeft, LogOut, Menu, Search, X } from 'lucide-react';
import { navigation } from '@/config/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import styles from './AdminShell.module.css';

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const closeMenuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
    router.refresh();
  }

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeMenuRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !sidebarRef.current) return;

      const focusable = Array.from(
        sidebarRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      );
      const first = focusable.at(0);
      const last = focusable.at(-1);

      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [mobileMenuOpen]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className={styles.shell}>
      <aside
        ref={sidebarRef}
        className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarOpen : ''}`}
        aria-label="منوی اصلی"
        aria-modal={mobileMenuOpen || undefined}
        role={mobileMenuOpen ? 'dialog' : undefined}
      >
        <div className={styles.brand}>
          <div className={styles.brandMark} aria-hidden="true">
            آی
          </div>
          <div>
            <strong>ایران یراق</strong>
            <span>مرکز عملیات</span>
          </div>
          <button
            ref={closeMenuRef}
            className={styles.closeMenu}
            onClick={() => setMobileMenuOpen(false)}
            type="button"
            aria-label="بستن منو"
          >
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
                    <span className={`${styles.navItem} ${styles.planned}`} key={item.href} title="این بخش هنوز پیاده‌سازی نشده است">
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
              <span>
                جستجو در پنل <small>به‌زودی</small>
              </span>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button type="button" aria-label="اعلان‌ها — به‌زودی" title="اعلان‌ها هنوز فعال نیست" disabled>
              <Bell size={19} />
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
            <button className={styles.logoutButton} type="button" onClick={handleSignOut} aria-label="خروج از حساب">
              <LogOut size={19} />
            </button>
          </div>
        </header>

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
