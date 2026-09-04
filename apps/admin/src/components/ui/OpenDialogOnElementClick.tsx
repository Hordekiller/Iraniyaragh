'use client';

import type { ComponentType, ElementType } from 'react';
import { useState } from 'react';

export type OpenDialogOnElementClickProps = {
  /** The trigger element component type (e.g. Button, Typography, Card). */
  element: ElementType;
  elementProps?: Record<string, unknown>;
  /** The dialog component type. Receives `open` and `setOpen` as props. */
  dialog: ComponentType<{ open: boolean; setOpen: (open: boolean) => void } & Record<string, unknown>>;
  dialogProps?: Record<string, unknown>;
};

/**
 * Decouples any clickable element from any controlled dialog. The trigger's
 * own onClick (if any) runs first, then the dialog is opened. The dialog
 * receives `open` and `setOpen` automatically alongside `dialogProps`.
 */
export function OpenDialogOnElementClick({
  element: Element,
  elementProps,
  dialog: Dialog,
  dialogProps,
}: OpenDialogOnElementClickProps) {
  const [open, setOpen] = useState(false);

  const originalOnClick =
    typeof elementProps?.onClick === 'function' ? (elementProps.onClick as () => void) : undefined;

  return (
    <>
      <Element
        {...elementProps}
        onClick={() => {
          originalOnClick?.();
          setOpen(true);
        }}
      />
      <Dialog {...dialogProps} open={open} setOpen={setOpen} />
    </>
  );
}
