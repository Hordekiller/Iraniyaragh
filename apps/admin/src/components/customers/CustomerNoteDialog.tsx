'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
} from '@mui/material';
import type { AdminCustomerSummary, CustomerNoteVisibility } from '@iranyaragh/contracts';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { addNote, newCustomerCommandKey } from '@/lib/customers/customers-api';
import { noteBodyError } from '@/lib/customers/customers-labels';
import { customerFormError } from './CustomerDialog';

type Props = {
  open: boolean;
  customer: AdminCustomerSummary;
  onClose: () => void;
  onSaved: () => void;
};

export function CustomerNoteDialog({ open, customer, onClose, onSaved }: Props) {
  const [visibility, setVisibility] = useState<CustomerNoteVisibility>('INTERNAL');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVisibility('INTERNAL');
    setBody('');
    setError(null);
  }, [open, customer]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const validation = noteBodyError(body);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await addNote(
        customer.id,
        { expectedVersion: customer.version, visibility, body: body.trim() },
        newCustomerCommandKey('note'),
      );
      onSaved();
      onClose();
    } catch (failure) {
      setError(
        failure instanceof ApiNetworkError || failure instanceof ApiClientError
          ? customerFormError(failure)
          : 'ثبت یادداشت ناموفق بود.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="customer-note-title"
    >
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle id="customer-note-title">افزودن یادداشت به مشتری</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <RadioGroup
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as CustomerNoteVisibility)}
            >
              <FormControlLabel
                value="INTERNAL"
                control={<Radio disabled={submitting} />}
                label="داخلی — فقط برای کارکنان"
              />
              <FormControlLabel
                value="CUSTOMER_VISIBLE"
                control={<Radio disabled={submitting} />}
                label="قابل مشاهده برای مشتری"
              />
            </RadioGroup>
            {visibility === 'CUSTOMER_VISIBLE' ? (
              <Alert severity="warning">
                یادداشت قابل مشاهده برای مشتری است؛ هر چیزی که نباید مشتری بخواند در این دسته
                ثبت نکنید.
              </Alert>
            ) : null}
            <TextField
              label="متن یادداشت"
              required
              multiline
              minRows={4}
              value={body}
              disabled={submitting}
              onChange={(event) => setBody(event.target.value)}
              inputProps={{ maxLength: 2000 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onClose} disabled={submitting}>
            انصراف
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'در حال ثبت…' : 'ثبت یادداشت'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
