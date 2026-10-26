'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AccessPermission } from '@iranyaragh/contracts';
import {
  PERMISSION_GROUP_LABELS,
  PERMISSION_GROUP_ORDER,
  permissionGroupLabel,
  permissionLabel,
} from '@/lib/access/access-labels';

type Props = {
  permissions: AccessPermission[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  actorPermissionKeys: ReadonlySet<string>;
  lockedKeys?: ReadonlySet<string>;
  disabled?: boolean;
};

type GroupedPermissions = { group: string; items: AccessPermission[] };

function groupPermissions(permissions: AccessPermission[]): GroupedPermissions[] {
  const groups = new Map<string, AccessPermission[]>();
  for (const permission of permissions) {
    const list = groups.get(permission.group) ?? [];
    list.push(permission);
    groups.set(permission.group, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const indexA = PERMISSION_GROUP_ORDER.indexOf(a);
      const indexB = PERMISSION_GROUP_ORDER.indexOf(b);
      return (indexA < 0 ? Number.MAX_SAFE_INTEGER : indexA) - (indexB < 0 ? Number.MAX_SAFE_INTEGER : indexB);
    })
    .map(([group, items]) => ({
      group,
      items: [...items].sort((a, b) => permissionLabel(a).localeCompare(permissionLabel(b), 'fa')),
    }));
}

export function PermissionPicker({
  permissions,
  selected,
  onChange,
  actorPermissionKeys,
  lockedKeys,
  disabled = false,
}: Props) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase('fa');

  const grouped = useMemo(() => {
    const active = permissions.filter((permission) => permission.isActive || selected.has(permission.key));
    const filtered = query
      ? active.filter(
          (permission) =>
            permission.key.includes(query) ||
            permissionLabel(permission).includes(query) ||
            permissionGroupLabel(permission.group).includes(query),
        )
      : active;
    return groupPermissions(filtered);
  }, [permissions, query, selected]);

  const toggle = (key: string, checked: boolean) => {
    if (disabled) return;
    if (!checked && lockedKeys?.has(key)) return;
    if (checked && !actorPermissionKeys.has(key)) return;
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(next);
  };

  const toggleGroup = (items: AccessPermission[], checked: boolean) => {
    if (disabled) return;
    const next = new Set(selected);
    for (const permission of items) {
      if (!checked) {
        if (!lockedKeys?.has(permission.key)) next.delete(permission.key);
      } else if (actorPermissionKeys.has(permission.key)) {
        next.add(permission.key);
      }
    }
    onChange(next);
  };

  return (
    <Box>
      <TextField
        size="small"
        fullWidth
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="جستجوی دسترسی یا گروه"
        inputProps={{ 'aria-label': 'جستجوی دسترسی' }}
      />
      <Box
        sx={{
          mt: 1.5,
          maxHeight: 360,
          overflowY: 'auto',
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          p: 1.5,
        }}
      >
        {grouped.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            دسترسی‌ای مطابق جستجو یافت نشد.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {grouped.map((group) => {
              const selectedCount = group.items.filter((item) => selected.has(item.key)).length;
              const grantable = group.items.filter((item) => actorPermissionKeys.has(item.key));
              const allGrantableSelected = grantable.length > 0 && grantable.every((item) => selected.has(item.key));
              return (
                <Box key={group.group}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Typography variant="subtitle2" fontWeight={800}>
                      {PERMISSION_GROUP_LABELS[group.group] ?? group.group}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                        {selectedCount}/{group.items.length}
                      </Typography>
                    </Typography>
                    {!disabled && grantable.length > 0 ? (
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => toggleGroup(group.items, !allGrantableSelected)}
                        sx={{ minWidth: 0, fontSize: 12 }}
                      >
                        {allGrantableSelected ? 'برداشتن همه' : 'انتخاب همه'}
                      </Button>
                    ) : null}
                  </Stack>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 1 }}>
                    {group.items.map((permission) => {
                      const checked = selected.has(permission.key);
                      const locked = Boolean(lockedKeys?.has(permission.key));
                      const notGrantable = !actorPermissionKeys.has(permission.key);
                      return (
                        <FormControlLabel
                          key={permission.key}
                          control={
                            <Checkbox
                              size="small"
                              checked={checked}
                              onChange={(event) => toggle(permission.key, event.target.checked)}
                              disabled={disabled || locked || (notGrantable && !checked)}
                            />
                          }
                          label={
                            <Box>
                              <Typography variant="body2">{permissionLabel(permission)}</Typography>
                              <Typography variant="caption" color="text.secondary" dir="ltr" sx={{ display: 'block' }}>
                                {permission.key}
                                {notGrantable ? ' — خارج از دسترسی شما' : ''}
                                {locked ? ' — الزامی' : ''}
                              </Typography>
                            </Box>
                          }
                          sx={{ alignItems: 'flex-start', m: 0, py: 0.25 }}
                        />
                      );
                    })}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        فقط دسترسی‌هایی قابل اعطا هستند که خودتان در حال حاضر دارید. دسترسی‌های الزامی قابل حذف نیستند.
      </Typography>
    </Box>
  );
}
