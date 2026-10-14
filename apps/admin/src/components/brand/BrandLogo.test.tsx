import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandLogo } from './BrandLogo';
describe('Approved Admin logo assets', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('uses the configured Admin base path for the approved wordmark', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/admin'); render(<BrandLogo />);
    expect(screen.getByRole('img', { name: 'ایران یراق' })).toHaveAttribute('src', '/admin/brand/wordmark-864.webp');
  });
  it('uses the mark when the navigation is compact and stays self-hosted without a base path', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', ''); const view = render(<BrandLogo compact />);
    expect(view.container.querySelector('img')).toHaveAttribute('src', '/brand/mark-128.webp');
    expect(view.container.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.queryByText('آی')).not.toBeInTheDocument();
  });
});
