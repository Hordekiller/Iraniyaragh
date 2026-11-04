import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageBannersPage } from './HomepageBannersPage';
import { readHomepageBanners, saveHomepageBanners } from '@/lib/settings/homepage-banners-api';

const auth = vi.hoisted(() => ({ user: { userId: 'operator', permissions: ['settings.manage'] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/settings/homepage-banners-api', () => ({ readHomepageBanners: vi.fn(), saveHomepageBanners: vi.fn() }));

const media = [{ id: 'm1', url: 'https://cdn.test/m1.webp', width: 1200, height: 600, alt: 'لولا', productName: 'لولا ۳۵' }];
const banner = { id: 'b1', title: 'لولا کابینت', subtitle: null, ctaLabel: 'مشاهده', href: '/categories/hinges', desktopMediaId: 'm1', mobileMediaId: null, imageAlt: 'لولا', enabled: true, publishAt: null, unpublishAt: null };
const config = { version: 4, updatedAt: null, banners: [{ ...banner, desktopImage: media[0], mobileImage: null }] };

describe('homepage banner settings', () => {
  beforeEach(() => {
    auth.user.permissions = ['settings.manage'];
    vi.mocked(readHomepageBanners).mockReset().mockResolvedValue({ config, media } as never);
    vi.mocked(saveHomepageBanners).mockReset().mockResolvedValue({ ...config, version: 5 } as never);
  });

  it('loads banners with a live preview and saves the edit with version and idempotency key', async () => {
    render(<HomepageBannersPage />);
    const title = await screen.findByLabelText(/^عنوان/);
    expect(screen.getAllByLabelText('پیش‌نمایش زنده')).toHaveLength(1);
    fireEvent.change(title, { target: { value: 'ریل کشو' } });
    expect(screen.getAllByText('ریل کشو').length).toBeGreaterThan(1); // form + preview
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره و انتشار' }));
    await screen.findByText('بنرها ذخیره شدند.');
    expect(saveHomepageBanners).toHaveBeenCalledWith({ expectedVersion: 4, banners: [{ ...banner, title: 'ریل کشو' }] }, expect.stringMatching(/^homepage-banners-/));
  });

  it('caps the grid at four banners and allows disabling individually', async () => {
    render(<HomepageBannersPage />);
    await screen.findByLabelText(/^عنوان/);
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: 'افزودن بنر' }));
    expect(screen.getByRole('button', { name: 'افزودن بنر' })).toBeDisabled();
    expect(screen.getAllByRole('switch', { name: 'فعال' })).toHaveLength(4);
  });

  it('does not read or write without settings.manage', () => {
    auth.user.permissions = [];
    render(<HomepageBannersPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('مجوز مدیریت تنظیمات لازم است.');
    expect(readHomepageBanners).not.toHaveBeenCalled();
  });
});
