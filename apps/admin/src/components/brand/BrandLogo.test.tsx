import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandLogo } from './BrandLogo';
describe('Approved Admin logo assets', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('uses the configured Admin base path for the approved wordmark', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/admin'); render(<BrandLogo />);
    expect(screen.getByRole('img', { name: 'ایرانی یراق' })).toHaveAttribute('src', '/admin/brand/wordmark-864.webp?v=20261104');
  });
  it('uses the mark when the navigation is compact and stays self-hosted without a base path', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', ''); const view = render(<BrandLogo compact />);
    expect(view.container.querySelector('img')).toHaveAttribute('src', '/brand/mark-128.webp?v=20261104');
    expect(view.container.querySelector('img')).toHaveAttribute('alt', 'ایرانی یراق');
    expect(screen.queryByText('آی')).not.toBeInTheDocument();
  });
});
