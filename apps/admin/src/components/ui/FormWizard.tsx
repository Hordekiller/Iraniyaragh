'use client';

import { useState, type ReactNode } from 'react';
import { Box, Button, Stepper, Step, StepLabel } from '@mui/material';

export type FormWizardStep = {
  label: string;
  optionalContent?: ReactNode;
};

export type FormWizardProps = {
  steps: FormWizardStep[];
  /** Renders the content for the active step index. */
  renderStep: (index: number) => ReactNode;
  onFinish?: () => void | Promise<void>;
  /** Called when the user tries to move forward; return false to block. */
  beforeNext?: (index: number) => boolean;
  finishLabel?: string;
  nextLabel?: string;
  backLabel?: string;
  loading?: boolean;
};

export function FormWizard({
  steps,
  renderStep,
  onFinish,
  beforeNext,
  finishLabel = 'پایان',
  nextLabel = 'بعدی',
  backLabel = 'قبلی',
  loading = false,
}: FormWizardProps) {
  const [active, setActive] = useState(0);
  const isLast = active === steps.length - 1;

  const handleNext = () => {
    if (beforeNext && !beforeNext(active)) return;
    if (isLast) {
      void onFinish?.();
    } else {
      setActive((a) => a + 1);
    }
  };

  const handleBack = () => setActive((a) => Math.max(0, a - 1));

  return (
    <Box>
      <Stepper activeStep={active} alternativeLabel nonLinear={false}>
        {steps.map((step) => (
          <Step key={step.label}>
            <StepLabel>
              {step.label}
              {step.optionalContent}
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box sx={{ mt: 4 }}>{renderStep(active)}</Box>

      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between' }}>
        <Button
          variant="outlined"
          color="secondary"
          onClick={handleBack}
          disabled={active === 0 || loading}
        >
          {backLabel}
        </Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={loading}
        >
          {isLast ? finishLabel : nextLabel}
        </Button>
      </Box>
    </Box>
  );
}
