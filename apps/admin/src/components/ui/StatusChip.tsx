'use client';

import Chip, { type ChipProps } from '@mui/material/Chip';

export type StatusTone = 'success' | 'info' | 'warning' | 'error' | 'neutral';

export type StatusChipProps = Omit<ChipProps, 'color' | 'label'> & {
  label: string;
  /** Semantic tone mapped to a MUI color. Defaults to `neutral`. */
  tone?: StatusTone;
  size?: ChipProps['size'];
  /** True for a fully rounded (pill) chip, mirroring the Vuexy chip variant. */
  round?: boolean;
};

const TONE_COLOR = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  error: 'error',
  neutral: 'default',
} as const;

/**
 * Thin, typed wrapper over MUI `Chip` that maps a semantic tone to a localized
 * chip color (enum → localized label + tone, per ADMIN_PANEL_PLAN §6.5 and the
 * first primitive proposed by the product/UX owner). Structural reference:
 * Vuexy `@core/components/mui/Chip.tsx` (a customized MUI Chip with a `round`
 * variant). No business logic — it only maps presentation tone to color.
 */
export function StatusChip({
  label,
  tone = 'neutral',
  size = 'small',
  round = true,
  ...rest
}: StatusChipProps) {
  return (
    <Chip
      label={label}
      size={size}
      color={TONE_COLOR[tone]}
      {...(round ? { style: { borderRadius: 500 } } : {})}
      {...rest}
    />
  );
}
