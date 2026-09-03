'use client';

import Link from 'next/link';
import { Card, CardActionArea, CardContent, Grid, Typography } from '@mui/material';

const links = [
  { href: '/showcase/data-table', title: 'جدول داده', description: 'جستجو، مرتب‌سازی، انتخاب ردیف و صفحه‌بندی' },
  { href: '/showcase/forms', title: 'فرم و اعتبارسنجی', description: 'فیلدهای فرم، اعتبارسنجی داخلی و پیام‌ها' },
  { href: '/showcase/dialogs', title: 'دیالوگ‌ها و تأیید', description: 'دیالوگ تأیید و کارت‌های انتخابی' },
];

export default function ShowcaseHomePage() {
  return (
    <Grid container spacing={3}>
      <Grid size={12}>
        <Typography variant="h4" fontWeight={700}>
          نمایش کامپوننت‌های پایه
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          این صفحات مستقل از پوسته مدیریت هستند و صرفاً برای بازبینی کامپوننت‌های UI می‌باشند.
        </Typography>
      </Grid>
      {links.map((link) => (
        <Grid size={{ xs: 12, md: 4 }} key={link.href}>
          <Card raised={false} sx={{ height: '100%' }}>
            <CardActionArea
              component={Link}
              href={link.href}
              sx={{ textDecoration: 'none', height: '100%' }}
            >
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {link.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {link.description}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
