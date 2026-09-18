import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthSurface } from '../AuthSurface';

describe('AuthSurface', () => {
  it('provides one labelled main landmark and a keyboard bypass link', () => {
    render(
      <AuthSurface
        title="ورود کارکنان"
        description="توضیح ورود"
        footer="یادداشت امنیتی"
      >
        <form aria-label="فرم ورود" />
      </AuthSurface>,
    );

    expect(screen.getByRole('main')).toHaveAttribute('id', 'auth-main-content');
    expect(screen.getByRole('link', { name: 'پرش به فرم ورود' })).toHaveAttribute(
      'href',
      '#auth-main-content',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'ورود کارکنان',
    );
    expect(screen.getByRole('complementary')).toHaveAccessibleName(
      'معرفی پنل عملیات',
    );
  });
});
