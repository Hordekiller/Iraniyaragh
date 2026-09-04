import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusChip } from '../StatusChip';

describe('StatusChip', () => {
  it('renders the localized label', () => {
    render(<StatusChip label="فعال" />);
    expect(screen.getByText('فعال')).toBeInTheDocument();
  });

  it('defaults to a neutral small rounded chip', () => {
    const { container } = render(<StatusChip label="خنثی" />);
    const chip = container.querySelector('.MuiChip-root') as HTMLElement;
    expect(chip).toHaveClass('MuiChip-sizeSmall');
    // Pill variant via borderRadius 500
    expect(chip).toHaveStyle({ borderRadius: '500px' });
  });

  it('maps success tone to the success color', () => {
    const { container } = render(<StatusChip label="موفق" tone="success" />);
    const chip = container.querySelector('.MuiChip-root') as HTMLElement;
    expect(chip).toHaveClass('MuiChip-colorSuccess');
  });

  it('maps error tone to the error color', () => {
    const { container } = render(<StatusChip label="خطا" tone="error" />);
    const chip = container.querySelector('.MuiChip-root') as HTMLElement;
    expect(chip).toHaveClass('MuiChip-colorError');
  });

  it('does not force pill radius when round is false', () => {
    const { container } = render(<StatusChip label="مربعی" round={false} />);
    const chip = container.querySelector('.MuiChip-root') as HTMLElement;
    expect(chip).not.toHaveStyle({ borderRadius: '500px' });
  });
});
