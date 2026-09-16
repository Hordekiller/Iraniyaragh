'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Plus, PowerOff, Power } from 'lucide-react';
import type { AttributeDefinitionDetail, AttributeStatus } from '@iranyaragh/contracts';
import { DialogCloseButton } from '@/components/ui/DialogCloseButton';
import { FormField } from '@/components/ui/FormField';
import { StatusChip } from '@/components/ui/StatusChip';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import {
  attributeStatusLabel,
  attributeStatusTone,
} from '@/lib/catalog/catalog-labels';
import {
  createAttributeOption,
  createIdempotencyKey,
  getAttribute,
  updateAttributeOption,
} from '@/lib/catalog/catalog-api';

function validateAdd(code: string, label: string): { code?: string; label?: string } {
  const errors: { code?: string; label?: string } = {};
  if (!code.trim()) errors.code = 'کد گزینه الزامی است.';
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(code.trim())) errors.code = 'کد فقط شامل a-z، عدد و خط تیره (-) باشد.';
  if (!label.trim()) errors.label = 'برچسب گزینه الزامی است.';
  return errors;
}

export function AttributeOptionsDialog({
  attributeId,
  attributeName,
  onChanged,
  onClose,
}: {
  attributeId: string;
  attributeName: string;
  onChanged: () => void;
  onClose: () => void;
}) {
  const feedback = useFeedback();
  const [detail, setDetail] = useState<AttributeDefinitionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addCode, setAddCode] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addErrors, setAddErrors] = useState<{ code?: string; label?: string }>({});
  const [adding, setAdding] = useState(false);
  const [busyOptionId, setBusyOptionId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const addKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    getAttribute(attributeId, controller.signal)
      .then((data) => setDetail(data.attribute))
      .catch((error: unknown) => {
        if (error instanceof ApiAbortError) return;
        setLoadError('بارگیری گزینه‌های این ویژگی ناموفق بود.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attributeId, refreshKey]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const errors = validateAdd(addCode, addLabel);
    setAddErrors(errors);
    if (errors.code || errors.label) return;

    setAdding(true);
    try {
      const key = (addKeyRef.current ??= createIdempotencyKey('catalog-attribute-option'));
      await createAttributeOption(attributeId, { code: addCode.trim(), label: addLabel.trim() }, key);
      addKeyRef.current = null;
      feedback.success(`گزینهٔ «${addLabel.trim()}» ساخته شد.`);
      setAddCode('');
      setAddLabel('');
      onChanged();
      setRefreshKey((current) => current + 1);
    } catch (error) {
      feedback.error(error instanceof ApiClientError ? error.message : 'ساخت گزینه ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setAdding(false);
    }
  }

  async function toggleStatus(optionId: string, current: AttributeStatus, version: number) {
    setBusyOptionId(optionId);
    try {
      await updateAttributeOption(attributeId, optionId, {
        status: current === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        expectedVersion: version,
      });
      feedback.success('وضعیت گزینه به‌روزرسانی شد.');
      onChanged();
      setRefreshKey((current) => current + 1);
    } catch (error) {
      feedback.error(error instanceof ApiClientError ? error.message : 'تغییر وضعیت گزینه ناموفق بود.');
    } finally {
      setBusyOptionId(null);
    }
  }

  const titleId = 'attribute-options-title';

  return (
    <Dialog open onClose={loading ? undefined : onClose} fullWidth maxWidth="sm" scroll="body" aria-labelledby={titleId}>
      <DialogCloseButton onClick={onClose} disabled={loading} />
      <DialogContent>
        <DialogTitle id={titleId} sx={{ p: 0, mb: 2 }}>
          گزینه‌های «{attributeName}»
        </DialogTitle>

        {loading && !detail ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} aria-label="در حال بارگیری گزینه‌ها" />
          </Box>
        ) : loadError ? (
          <Alert severity="error">{loadError}</Alert>
        ) : detail ? (
          <>
            <TableContainer>
              <Table size="small" aria-label="گزینه‌های ویژگی">
                <TableHead>
                  <TableRow>
                    <TableCell>کد</TableCell>
                    <TableCell>برچسب</TableCell>
                    <TableCell>وضعیت</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.options.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary">
                          هنوز گزینه‌ای ثبت نشده است.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail.options.map((option) => (
                      <TableRow key={option.id}>
                        <TableCell>
                          <Typography variant="body2" dir="ltr" textAlign="start">
                            {option.code}
                          </Typography>
                        </TableCell>
                        <TableCell>{option.label}</TableCell>
                        <TableCell>
                          <StatusChip label={attributeStatusLabel(option.status)} tone={attributeStatusTone(option.status)} />
                        </TableCell>
                        <TableCell>
                          {busyOptionId === option.id ? (
                            <CircularProgress size={16} aria-label="در حال تغییر وضعیت" />
                          ) : (
                            <Tooltip title={option.status === 'ACTIVE' ? 'غیرفعال کردن' : 'فعال کردن'}>
                              <IconButton
                                size="small"
                                aria-label={`${option.status === 'ACTIVE' ? 'غیرفعال کردن' : 'فعال کردن'} گزینهٔ ${option.label}`}
                                onClick={() => void toggleStatus(option.id, option.status, option.version)}
                              >
                                {option.status === 'ACTIVE' ? <PowerOff size={15} /> : <Power size={15} />}
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Box component="form" onSubmit={handleAdd} noValidate sx={{ mt: 3 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                افزودن گزینه
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="flex-start">
                <FormField
                  label="کد"
                  required
                  htmlFor="option-add-code"
                  error={Boolean(addErrors.code)}
                  errorText={addErrors.code}
                >
                  <TextField
                    id="option-add-code"
                    size="small"
                    dir="ltr"
                    value={addCode}
                    onChange={(event) => setAddCode(event.target.value.toLocaleLowerCase('en-US'))}
                  />
                </FormField>
                <FormField
                  label="برچسب"
                  required
                  htmlFor="option-add-label"
                  error={Boolean(addErrors.label)}
                  errorText={addErrors.label}
                >
                  <TextField
                    id="option-add-label"
                    size="small"
                    value={addLabel}
                    onChange={(event) => setAddLabel(event.target.value)}
                  />
                </FormField>
                <Button type="submit" variant="contained" size="small" sx={{ mt: { sm: 2.5 } }} disabled={adding} startIcon={adding ? <CircularProgress size={14} color="inherit" /> : <Plus size={16} />}>
                  {adding ? 'در حال ساخت…' : 'افزودن'}
                </Button>
              </Stack>
            </Box>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}