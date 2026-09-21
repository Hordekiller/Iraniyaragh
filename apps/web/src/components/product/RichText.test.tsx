import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichText } from './RichText';

describe('RichText', () => {
  it('renders server-sanitized markup as semantic nodes, not escaped text', () => {
    render(
      <RichText
        html='<h2>ویژگی‌ها</h2><p>متن <strong>پررنگ</strong> و <a href="/p/x">پیوند</a></p><blockquote>نقل‌قول</blockquote>'
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'ویژگی‌ها' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'پیوند' })).toHaveAttribute(
      'href',
      '/p/x',
    );
    expect(screen.getByText('پررنگ').tagName).toBe('STRONG');
    expect(screen.getByRole('blockquote')).toHaveTextContent('نقل‌قول');
  });

  it('never shows the raw markup in the rendered text', () => {
    const { container } = render(<RichText html='<p><em>x</em></p>' />);
    expect(container.textContent).toContain('x');
    expect(container.textContent).not.toContain('<em>');
  });

  it('renders images with src and alt from the trusted projection', () => {
    render(
      <RichText
        html='<p><img src="/media/x.webp" width="200" height="150" alt="نمودار"></p>'
      />,
    );
    const image = screen.getByRole('img', { name: 'نمودار' });
    expect(image).toHaveAttribute('src', '/media/x.webp');
    expect(image).toHaveAttribute('width', '200');
  });

  it('merges the caller className on the rich-text container', () => {
    const { container } = render(
      <RichText html='<p>متن</p>' className="mt-4 text-slate-500" />,
    );
    const node = container.querySelector('[data-rich-text]');
    expect(node).toHaveClass('mt-4', 'text-slate-500');
    expect(node).toHaveAttribute('data-rich-text', 'true');
  });
});