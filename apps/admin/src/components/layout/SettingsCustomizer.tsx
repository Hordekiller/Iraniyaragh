'use client';

import {
  Box,
  Button,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { RotateCcw, Settings2, X } from 'lucide-react';
import { useState } from 'react';
import { useAdminPreferences } from '@/lib/preferences/AdminPreferencesProvider';
import type {
  AdminLayoutType,
  AdminMode,
  AdminSkin,
  ContentWidth,
} from '@/lib/preferences/preferences';

const choices = {
  mode: [
    ['light', 'روشن'],
    ['dark', 'تیره'],
    ['system', 'مطابق دستگاه'],
  ],
  skin: [
    ['default', 'سطوح برجسته'],
    ['bordered', 'کادر‌دار'],
  ],
  layout: [
    ['vertical', 'منوی عمودی'],
    ['horizontal', 'منوی افقی'],
  ],
  contentWidth: [
    ['fluid', 'تمام‌عرض'],
    ['boxed', 'محدود و مرکزی'],
  ],
} as const;

type ChoiceGroupProps<T extends string> = {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
};

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: ChoiceGroupProps<T>) {
  return (
    <FormControl component="fieldset" fullWidth>
      <FormLabel
        component="legend"
        sx={{ color: 'text.primary', fontWeight: 800 }}
      >
        {label}
      </FormLabel>
      <RadioGroup
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <FormControlLabel
            key={optionValue}
            value={optionValue}
            control={<Radio size="small" />}
            label={optionLabel}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}

export function SettingsCustomizer() {
  const [open, setOpen] = useState(false);
  const { prefs, updatePrefs, resetPrefs } = useAdminPreferences();

  return (
    <>
      <IconButton
        aria-label="شخصی‌سازی ظاهر پنل"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        sx={{
          width: 42,
          height: 42,
          border: 1,
          borderColor: 'divider',
          borderRadius: 3,
        }}
      >
        <Settings2 size={20} />
      </IconButton>
      <Drawer
        anchor="left"
        open={open}
        onClose={() => setOpen(false)}
        slotProps={{
          paper: {
            'aria-labelledby': 'admin-customizer-title',
            sx: { width: { xs: 'min(92vw, 360px)', sm: 360 } },
          },
        }}
      >
        <Box
          component="header"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2.5 }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography
              id="admin-customizer-title"
              component="h2"
              variant="h6"
              fontWeight={900}
            >
              شخصی‌سازی پنل
            </Typography>
            <Typography variant="body2" color="text.secondary">
              این تنظیمات فقط ظاهر را تغییر می‌دهند و شامل اطلاعات حساب نیستند.
            </Typography>
          </Box>
          <IconButton
            aria-label="بستن شخصی‌سازی"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </IconButton>
        </Box>
        <Divider />
        <Box sx={{ display: 'grid', gap: 2.5, p: 2.5, overflowY: 'auto' }}>
          <ChoiceGroup<AdminMode>
            label="حالت رنگ"
            value={prefs.mode}
            options={choices.mode}
            onChange={(mode) => updatePrefs({ mode })}
          />
          <ChoiceGroup<AdminSkin>
            label="نمای کارت‌ها"
            value={prefs.skin}
            options={choices.skin}
            onChange={(skin) => updatePrefs({ skin })}
          />
          <ChoiceGroup<AdminLayoutType>
            label="چیدمان منو"
            value={prefs.layout}
            options={choices.layout}
            onChange={(layout) => updatePrefs({ layout })}
          />
          <ChoiceGroup<ContentWidth>
            label="عرض محتوا"
            value={prefs.contentWidth}
            options={choices.contentWidth}
            onChange={(contentWidth) => updatePrefs({ contentWidth })}
          />
          <Divider />
          <Button
            startIcon={<RotateCcw size={18} />}
            variant="outlined"
            onClick={resetPrefs}
          >
            بازنشانی تنظیمات ظاهر
          </Button>
        </Box>
      </Drawer>
    </>
  );
}
