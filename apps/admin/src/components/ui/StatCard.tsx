'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, Typography, Box, Skeleton } from '@mui/material';
import type { SxProps } from '@mui/material/styles';

export type StatVariant = 'vertical' | 'horizontal' | 'square';

export type StatCardProps = {
  variant?: StatVariant;
  /** The numeric/primary stat string. Pass "—" or a number-like value. */
  stats: string;
  title: string;
  subtitle?: string;
  /** A custom avatar node, typically a lucide icon inside a colored Box. */
  avatar?: ReactNode;
  /** Tail element such as a chip, shown at the bottom (vertical only). */
  footer?: ReactNode;
  accent?: string;
  loading?: boolean;
  sx?: SxProps;
};

function Avatar({ children, accent, tone }: { children: ReactNode; accent: string; tone: 'tint' | 'solid' }) {
  const solid = tone === 'solid';
  return (
    <Box
      aria-hidden="true"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '14px',
        width: 46,
        height: 46,
        flexShrink: 0,
        color: solid ? '#fff' : accent,
        bgcolor: solid ? accent : `${accent}1A`,
      }}
    >
      {children}
    </Box>
  );
}

export function StatCard({
  variant = 'vertical',
  stats,
  title,
  subtitle,
  avatar,
  footer,
  accent = '#ff5a17',
  loading = false,
  sx,
}: StatCardProps) {
  const body = loading ? (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
      <Skeleton width="45%" height={32} />
      <Skeleton width="70%" />
    </Box>
  ) : (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        gap: 2,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography component="div" variant="h5" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
          {stats}
        </Typography>
        <Typography component="div" variant="body2" color="text.secondary" sx={{ mt: 0.5 }} noWrap>
          {title}
        </Typography>
        {subtitle ? (
          <Typography component="div" variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {avatar ? <Avatar accent={accent} tone="tint">{avatar}</Avatar> : null}
    </Box>
  );

  if (variant === 'horizontal') {
    return (
      <Card sx={{ height: '100%', ...sx }}>
        <CardContent sx={{ display: 'flex', alignItems: 'flex-start' }}>{body}</CardContent>
      </Card>
    );
  }

  if (variant === 'square') {
    return (
      <Card sx={{ height: '100%', ...sx }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
          {avatar ? <Avatar accent={accent} tone="solid">{avatar}</Avatar> : null}
          {loading ? (
            <>
              <Skeleton width="60%" height={30} />
              <Skeleton width="80%" />
            </>
          ) : (
            <>
              <Typography component="div" variant="h5" sx={{ fontWeight: 800, mt: 1 }}>
                {stats}
              </Typography>
              <Typography component="div" variant="body2" color="text.secondary">
                {title}
              </Typography>
              {subtitle ? (
                <Typography component="div" variant="caption" color="text.secondary">
                  {subtitle}
                </Typography>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // vertical
  return (
    <Card sx={{ height: '100%', ...sx }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {avatar ? <Avatar accent={accent} tone="tint">{avatar}</Avatar> : null}
        {body}
        {footer ? <Box sx={{ mt: 'auto' }}>{footer}</Box> : null}
      </CardContent>
    </Card>
  );
}
