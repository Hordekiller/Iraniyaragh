import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

async function mountAt(path: string) {
  vi.resetModules()
  vi.stubEnv('VITE_FIXTURE_AUTH', 'true')
  vi.stubEnv('VITE_FIXTURE_CATALOG', 'true')
  window.history.pushState({}, '', path)
  const { default: App } = await import('./App')
  render(React.createElement(App))
}

const routes: Array<[string, () => Promise<void> | void]> = [
  [
    '/',
    async () => {
      expect(
        await screen.findByLabelText('جستجو در محصولات'),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: /تخصصی ابزار/ }),
      ).toBeInTheDocument()
    },
  ],
  [
    '/category/power-tools',
    async () => {
      expect(
        await screen.findByRole('heading', { name: 'ابزار برقی' }),
      ).toBeInTheDocument()
    },
  ],
  [
    '/product/ronix-2210-hammer-drill',
    async () => {
      expect(
        await screen.findByRole('heading', { name: /رونیکس ۲۲۱۰/ }),
      ).toBeInTheDocument()
    },
  ],
  [
    '/cart',
    async () => {
      expect(
        await screen.findByRole('heading', { name: 'سبد خرید شما خالی است' }),
      ).toBeInTheDocument()
    },
  ],
  [
    '/checkout',
    async () => {
      expect(
        await screen.findByRole('heading', {
          name: 'برای ادامه خرید، شماره موبایل را تأیید کنید',
        }),
      ).toBeInTheDocument()
    },
  ],
  [
    '/orders',
    async () => {
      expect(
        await screen.findByRole('heading', { name: /وارد شوید/ }),
      ).toBeInTheDocument()
    },
  ],
  [
    '/orders/IR-9999-1',
    async () => {
      expect(
        await screen.findByRole('heading', {
          name: 'برای مشاهده سفارش وارد شوید',
        }),
      ).toBeInTheDocument()
    },
  ],
  [
    '/payment/IR-9999-1',
    async () => {
      expect(
        await screen.findByRole('heading', {
          name: 'برای بررسی پرداخت وارد شوید',
        }),
      ).toBeInTheDocument()
    },
  ],
  [
    '/bestsellers',
    async () => {
      expect(
        await screen.findByRole('heading', { name: 'پرفروش‌ترین‌ها' }),
      ).toBeInTheDocument()
    },
  ],
  [
    '/search',
    async () => {
      expect(
        await screen.findByText('عبارتی برای جستجو وارد کنید.'),
      ).toBeInTheDocument()
    },
  ],
  [
    '/account',
    async () => {
      expect(
        await screen.findByRole('heading', { name: /وارد حساب کاربری شوید/ }),
      ).toBeInTheDocument()
    },
  ],
  [
    '/no-such-route',
    async () => {
      expect(
        await screen.findByRole('heading', { name: 'صفحه‌ای پیدا نشد' }),
      ).toBeInTheDocument()
    },
  ],
]

describe.each(routes)('App at %s', (_path, assert) => {
  afterEach(() => {
    vi.unstubAllEnvs()
    window.history.pushState({}, '', '/')
  })

  it('serves the route through the storefront shell', async () => {
    await mountAt(_path)
    await assert()
  })
})
