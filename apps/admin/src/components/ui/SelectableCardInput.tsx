'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { Box, CardActionArea, Stack, Typography, useTheme } from '@mui/material';
import { Check } from 'lucide-react';

export type SelectableCardValue = string | number;

type SelectableCardContextValue = {
  name?: string;
  value: SelectableCardValue | null;
  onChange: (value: SelectableCardValue) => void;
  register: (value: SelectableCardValue, el: HTMLButtonElement | null) => void;
  onArrow: (value: SelectableCardValue, direction: 'next' | 'previous') => void;
};

const SelectableCardContext = createContext<SelectableCardContextValue | null>(null);

export type SelectableCardGroupProps = {
  value: SelectableCardValue | null;
  onValueChange: (value: SelectableCardValue) => void;
  name?: string;
  /** Accessible name for the group. */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * A radio-like option group. Provides `role="radiogroup"` semantics and
 * arrow-key navigation across its `SelectableCardInput` children.
 */
export function SelectableCardGroup({
  value,
  onValueChange,
  name,
  label,
  children,
  className,
}: SelectableCardGroupProps) {
  const labelId = useId();
  const optionRefs = useRef(new Map<SelectableCardValue, HTMLButtonElement>());
  const orderRef = useRef<SelectableCardValue[]>([]);

  const register = useCallback(
    (optionValue: SelectableCardValue, el: HTMLButtonElement | null) => {
      if (el) {
        if (!optionRefs.current.has(optionValue)) {
          orderRef.current.push(optionValue);
        }
        optionRefs.current.set(optionValue, el);
      } else {
        optionRefs.current.delete(optionValue);
        orderRef.current = orderRef.current.filter((v) => v !== optionValue);
      }
    },
    [],
  );

  const focusOption = useCallback((optionValue: SelectableCardValue) => {
    optionRefs.current.get(optionValue)?.focus();
  }, []);

  const handleArrow = useCallback(
    (currentValue: SelectableCardValue, direction: 'next' | 'previous') => {
      const order = orderRef.current;
      if (order.length === 0) return;
      const idx = order.indexOf(currentValue);
      if (idx === -1) return;
      const next =
        direction === 'next'
          ? (idx + 1) % order.length
          : (idx - 1 + order.length) % order.length;
      focusOption(order[next]!);
    },
    [focusOption],
  );

  const handleChange = useCallback(
    (optionValue: SelectableCardValue) => {
      onValueChange(optionValue);
    },
    [onValueChange],
  );

  const contextValue = useMemo<SelectableCardContextValue>(
    () => ({ name, value, onChange: handleChange, register, onArrow: handleArrow }),
    [name, value, handleChange, register, handleArrow],
  );

  return (
    <SelectableCardContext.Provider value={contextValue}>
      <Box
        role="radiogroup"
        aria-labelledby={labelId}
        className={className}
        sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
      >
        <Typography id={labelId} component="span" sx={{ fontWeight: 600, mb: 0.5 }}>
          {label}
        </Typography>
        {children}
      </Box>
    </SelectableCardContext.Provider>
  );
}

export type SelectableCardInputProps = {
  value: SelectableCardValue;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  content?: ReactNode;
};

/**
 * A single selectable option inside a `SelectableCardGroup`. Renders as a
 * `<button role="radio">` so it is keyboard-focusable and correctly announced.
 * The visual check reflects `aria-checked`; arrow keys move between options.
 */
export function SelectableCardInput({
  value,
  icon,
  title,
  subtitle,
  content,
}: SelectableCardInputProps) {
  const theme = useTheme();
  const context = useContext(SelectableCardContext);
  const optionRef = useRef<HTMLButtonElement>(null);
  const selected = context?.value === value;

  const handleRef = (el: HTMLButtonElement | null) => {
    optionRef.current = el;
    context?.register(value, el);
  };

  return (
    <CardActionArea
      ref={handleRef}
      component="button"
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={title}
      onClick={() => context?.onChange(value)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
          event.preventDefault();
          context?.onArrow(value, 'next');
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
          event.preventDefault();
          context?.onArrow(value, 'previous');
        }
      }}
      sx={{
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        borderRadius: 3,
        bgcolor: selected ? `${theme.palette.primary.main}14` : 'background.paper',
        boxShadow: selected ? `0 0 0 1px ${theme.palette.primary.main} inset` : 'none',
        transition: 'border-color 0.15s ease, background-color 0.15s ease',
        p: 2.5,
        textAlign: 'start',
        width: '100%',
      }}
    >
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Box
          aria-hidden="true"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 2,
            flexShrink: 0,
            bgcolor: 'action.hover',
            color: selected ? 'primary.main' : 'text.secondary',
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          ) : null}
          {content ? <Box sx={{ mt: 1 }}>{content}</Box> : null}
        </Box>
        <Box
          aria-hidden="true"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: '50%',
            flexShrink: 0,
            border: '1px solid',
            borderColor: selected ? 'primary.main' : 'divider',
            bgcolor: selected ? 'primary.main' : 'transparent',
            color: selected ? 'primary.contrastText' : 'transparent',
          }}
        >
          <Check size={14} strokeWidth={3} />
        </Box>
      </Stack>
    </CardActionArea>
  );
}
