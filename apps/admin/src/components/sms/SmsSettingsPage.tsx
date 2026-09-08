'use client';

import { useMemo } from 'react';
import { Alert, Box, Button, Skeleton } from '@mui/material';
import { MessageSquareText } from 'lucide-react';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { resolveSmsSettingsService, isSmsSettingsFixtureEnabled } from '@/lib/sms/sms-settings-guard';
import { useSmsSettings } from '@/lib/sms/use-sms-settings';
import { getAccessToken } from '@/lib/auth/token-store';
import { SmsSettingsSummary } from './SmsSettingsSummary';
import { SmsSettingsForm, type SmsSettingsUpdatePatch } from './SmsSettingsForm';
import { SmsSecretPanel } from './SmsSecretPanel';
import { SmsActionsPanel } from './SmsActionsPanel';
import { SmsDiagnosticsPanel } from './SmsDiagnosticsPanel';

export function SmsSettingsPage() {
  return (
    <FeedbackProvider>
      <SmsSettingsContent />
    </FeedbackProvider>
  );
}

function SmsSettingsContent() {
  const service = useMemo(
    () => resolveSmsSettingsService(() => getAccessToken()),
    [],
  );
  const model = useSmsSettings({ service });
  const fixture = isSmsSettingsFixtureEnabled();

  return (
    <Box>
      <PageHeader
        eyebrow="سیستم / اعلان‌ها"
        title="تنظیمات سرویس پیامک"
        description="پیکربندی سرویس ارسال OTP، مدیریت کلید write-only و تشخیص وضعیت سرویس (ADR-0011 / issue #115)."
        breadcrumbs={[{ label: 'تنظیمات', href: '/settings' }, { label: 'سرویس پیامک' }]}
      />

      {fixture ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          این صفحه هم‌اکنون بر اساس فیکسچر قطعی (NEXT_PUBLIC_SMS_SETTINGS_FIXTURE=true) نمایش داده می‌شود و پس از
          اتصال API واقعی، دادهٔ زندهٔ همان سرویس جایگزین خواهد شد.
        </Alert>
      ) : null}

      {model.status === 'loading' ? (
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Skeleton height={128} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
            <Skeleton height={360} />
            <Skeleton height={300} />
          </Box>
        </Box>
      ) : null}

      {model.status === 'error' ? (
        <EmptyState
          icon={<MessageSquareText size={30} />}
          title="نمایش تنظیمات سرویس پیامک ممکن نیست"
          description={model.loadError ?? 'خطای غیرمنتظره سامانه.'}
          action={
            <Button variant="contained" onClick={() => void model.reload()}>
              تلاش مجدد
            </Button>
          }
        />
      ) : null}

      {model.status === 'ready' && model.snapshot ? (
        <Box sx={{ display: 'grid', gap: 3 }}>
          <SmsSettingsSummary snapshot={model.snapshot} diagnostics={model.diagnostics} />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
            <SmsSettingsForm
              snapshot={model.snapshot}
              busy={model.busy === 'save'}
              onSubmit={(patch: SmsSettingsUpdatePatch) => model.save(patch)}
            />
            <SmsSecretPanel
              snapshot={model.snapshot}
              busy={model.busy === 'rotate' || model.busy === 'clear'}
              onRotate={(secret) => model.rotate(secret)}
              onClear={model.clear}
            />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
            <SmsActionsPanel
              busy={model.busy}
              lastValidation={model.lastValidation}
              lastOutcome={model.lastOutcome}
              onValidate={model.validateNow}
              onTestSend={model.testSend}
            />
            <SmsDiagnosticsPanel diagnostics={model.diagnostics} />
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}