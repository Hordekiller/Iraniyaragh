import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageHeroPage } from './HomepageHeroPage';
import { readHomepageHero, saveHomepageHero } from '@/lib/settings/homepage-hero-api';

const auth = vi.hoisted(() => ({ user: { userId: 'operator', permissions: ['settings.manage'] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/settings/homepage-hero-api', () => ({ readHomepageHero: vi.fn(), saveHomepageHero: vi.fn() }));

const media = [{ id: 'm1', url: 'https://cdn.test/m1.webp', width: 1200, height: 600, alt: 'لولا', productName: 'لولا ۳۵' }];
const banner = { id: 'b1', title: 'لولا کابینت', subtitle: null, ctaLabel: 'مشاهده', href: '/categories/hinges', desktopMediaId: 'm1', mobileMediaId: null, imageAlt: 'لولا', enabled: true, publishAt: null, unpublishAt: null };
const config = { version: 4, updatedAt: null, banners: [{ ...banner, desktopImage: media[0], mobileImage: null }] };

describe('homepage banner settings', () => {
  beforeEach(() => {
    auth.user.permissions = ['settings.manage'];
    vi.mocked(readHomepageHero).mockReset().mockResolvedValue({ config, media } as never);
    vi.mocked(saveHomepageHero).mockReset().mockResolvedValue({ ...config, version: 5 } as never);
  });

  it('loads banners with a live preview and saves the edit with version and idempotency key', async () => {
    render(<HomepageHeroPage />);
    const title = await screen.findByLabelText(/^عنوان/);
    expect(screen.getAllByLabelText('پیش‌نمایش زنده')).toHaveLength(1);
    fireEvent.change(title, { target: { value: 'ریل کشو' } });
    expect(screen.getAllByText('ریل کشو').length).toBeGreaterThan(1); // form + preview
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره و انتشار' }));
    await screen.findByText('اسلایدها ذخیره شدند.');
    expect(saveHomepageHero).toHaveBeenCalledWith({ expectedVersion: 4, banners: [{ ...banner, title: 'ریل کشو' }] }, expect.stringMatching(/^homepage-hero-/));
  });

  it('caps the grid at four banners and allows disabling individually', async () => {
    render(<HomepageHeroPage />);
    await screen.findByLabelText(/^عنوان/);
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: 'افزودن اسلاید' }));
    expect(screen.getByRole('button', { name: 'افزودن اسلاید' })).toBeDisabled();
    expect(screen.getAllByRole('switch', { name: 'فعال' })).toHaveLength(4);
  });

  it('does not read or write without settings.manage', () => {
    auth.user.permissions = [];
    render(<HomepageHeroPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('مجوز مدیریت تنظیمات لازم است.');
    expect(readHomepageHero).not.toHaveBeenCalled();
  });
});
