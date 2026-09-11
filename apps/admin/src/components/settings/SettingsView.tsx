'use client';

import { Box, Button, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { RotateCcw, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { canManageSettings } from '@/lib/settings/settings-permissions';
import { useAdminPreferences } from '@/lib/preferences/AdminPreferencesProvider';
import type {
  AdminLayoutType,
  AdminMode,
  AdminSkin,
  ContentWidth,
} from '@/lib/preferences/AdminPreferencesProvider';

const MODE_OPTIONS: { value: AdminMode; label: string }[] = [
  { value: 'light', label: 'روشن' },
  { value: 'dark', label: 'تیره' },
  { value: 'system', label: 'سیستم' },
];

const SKIN_OPTIONS: { value: AdminSkin; label: string }[] = [
  { value: 'default', label: 'پیش‌فرض (کارت‌های برآمده)' },
  { value: 'bordered', label: 'خط‌دار' },
];

const LAYOUT_OPTIONS: { value: AdminLayoutType; label: string }[] = [
  { value: 'vertical', label: 'عمودی (نوار کناری)' },
  { value: 'horizontal', label: 'افقی (نوار بالا)' },
];

const WIDTH_OPTIONS: { value: ContentWidth; label: string }[] = [
  { value: 'fluid', label: 'تمام‌عرض' },
  { value: 'boxed', label: 'محدود' },
];

const MODE_LABEL: Record<AdminMode, string> = {
  light: 'روشن',
  dark: 'تیره',
  system: 'سیستم',
};

function OptionRow({
  slug,
  title,
  description,
  children,
}: {
  slug: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Box
      component="section"
      aria-labelledby={slug}
      sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', gap: 2, py: 2.5 }}
    >
      <Box sx={{ minWidth: 0, maxWidth: { sm: 340 } }}>
        <Typography id={slug} variant="subtitle2" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </Box>
      <Box sx={{ overflowX: 'auto', scrollbarWidth: 'thin' }}>{children}</Box>
    </Box>
  );
}

export function SettingsView() {
  const { user } = useAuth();
  const { prefs, resolvedMode, updatePrefs, resetPrefs } = useAdminPreferences();

  if (!canManageSettings(user)) {
    return (
      <EmptyState
        icon={<Settings2 size={28} />}
        title="دسترسی ندارید"
        description="برای تغییر تنظیمات پنل، به دسترسی «مدیریت تنظیمات» (settings.manage) نیاز دارید."
      />
    );
  }

  const pick =
    <T,>(onChange: (value: T) => void) =>
    (_event: React.MouseEvent<HTMLElement>, value: T | null) => {
      if (value !== null) onChange(value);
    };

  return (
    <Box>
      <PageHeader
        title="تنظیمات پنل"
        eyebrow="سیستم"
        description="تم، چیدمان و عرض محتوای پنل عملیات. این تنظیمات در این مرورگر ذخیره می‌شوند و هیچ دادهٔ حساسی ندارند."
        breadcrumbs={[{ label: 'سیستم' }, { label: 'تنظیمات' }]}
        actions={
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<RotateCcw size={16} />}
            onClick={resetPrefs}
          >
            بازنشانی پیش‌فرض
          </Button>
        }
      />

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack divider={<Box component="hr" sx={{ border: 0, borderTop: '1px solid', borderColor: 'divider', m: 0 }} />}>
          <OptionRow
            slug="settings-mode"
            title="حالت رنگ"
            description={`رنگ‌بندی کلی پنل. در حالت «سیستم» از تنظیمات دستگاه پیروی می‌شود؛ در حال حاضر: ${MODE_LABEL[resolvedMode]}`}
          >
            <ToggleButtonGroup
              exclusive
              color="primary"
              size="small"
              value={prefs.mode}
              onChange={pick<AdminMode>((value) => updatePrefs({ mode: value }))}
              aria-label="حالت رنگ پنل"
            >
              {MODE_OPTIONS.map((option) => (
                <ToggleButton value={option.value} key={option.value} sx={{ px: 2 }}>
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </OptionRow>

          <OptionRow
            slug="settings-skin"
            title="پوستهٔ کارت‌ها"
            description="کارت‌ها با سایهٔ برآمده یا کادر خط‌دار نمایش داده می‌شوند."
          >
            <ToggleButtonGroup
              exclusive
              color="primary"
              size="small"
              value={prefs.skin}
              onChange={pick<AdminSkin>((value) => updatePrefs({ skin: value }))}
              aria-label="پوستهٔ کارت‌ها"
            >
              {SKIN_OPTIONS.map((option) => (
                <ToggleButton value={option.value} key={option.value} sx={{ px: 2 }}>
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </OptionRow>

          <OptionRow
            slug="settings-layout"
            title="چیدمان"
            description="نوار کناری عمودی یا نوار ناوبری افقی زیر هدر."
          >
            <ToggleButtonGroup
              exclusive
              color="primary"
              size="small"
              value={prefs.layout}
              onChange={pick<AdminLayoutType>((value) => updatePrefs({ layout: value }))}
              aria-label="چیدمان پنل"
            >
              {LAYOUT_OPTIONS.map((option) => (
                <ToggleButton value={option.value} key={option.value} sx={{ px: 2 }}>
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </OptionRow>

          <OptionRow
            slug="settings-width"
            title="عرض محتوا"
            description="فضای کاری تمام‌عرض یا محدود در مرکز صفحه."
          >
            <ToggleButtonGroup
              exclusive
              color="primary"
              size="small"
              value={prefs.contentWidth}
              onChange={pick<ContentWidth>((value) => updatePrefs({ contentWidth: value }))}
              aria-label="عرض محتوای پنل"
            >
              {WIDTH_OPTIONS.map((option) => (
                <ToggleButton value={option.value} key={option.value} sx={{ px: 2 }}>
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </OptionRow>
        </Stack>
      </Paper>
    </Box>
  );
}