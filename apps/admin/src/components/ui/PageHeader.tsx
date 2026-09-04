'use client';

import type { ReactNode } from 'react';
import { Box, Typography, Breadcrumbs, Skeleton } from '@mui/material';
import Link from 'next/link';

export type BreadcrumbItem = { label: string; href?: string };

export type PageHeaderProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  loading?: boolean;
};

export function PageHeader({
  title,
  eyebrow,
  description,
  breadcrumbs,
  actions,
  loading = false,
}: PageHeaderProps) {
  if (loading) {
    return (
      <Box sx={{ mb: 4 }}>
        <Skeleton width="25%" height={18} />
        <Skeleton width="45%" height={38} sx={{ mt: 1 }} />
        <Skeleton width="65%" height={20} sx={{ mt: 1 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 4 }}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <Breadcrumbs sx={{ mb: 1, '& .MuiBreadcrumbs-separator': { mx: 0.5 } }}>
          {breadcrumbs.map((crumb, i) =>
            crumb.href && i < breadcrumbs.length - 1 ? (
              <Typography
                key={crumb.label}
                component={Link}
                href={crumb.href}
                color="text.secondary"
                sx={{ textDecoration: 'none', '&:hover': { color: 'primary.main' } }}
              >
                {crumb.label}
              </Typography>
            ) : (
              <Typography key={crumb.label} color="text.primary" fontWeight={600}>
                {crumb.label}
              </Typography>
            ),
          )}
        </Breadcrumbs>
      ) : null}

      {eyebrow ? (
        <Typography variant="caption" color="primary.main" fontWeight={700}>
          {eyebrow}
        </Typography>
      ) : null}

      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            {title}
          </Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 640 }}>
              {description}
            </Typography>
          ) : null}
        </Box>
        {actions ? <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>{actions}</Box> : null}
      </Box>
    </Box>
  );
}
