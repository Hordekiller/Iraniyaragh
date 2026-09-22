'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import type { Jodit } from 'jodit';
import 'jodit/es2018/jodit.min.css';
import { buildJoditProfile } from './jodit-profile';
import { buildMediaImageHtml } from '@/lib/editor/media-picker';
import type { MediaPickerHandle } from '@/lib/editor/media-picker';

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  height?: number | string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  mediaPicker?: MediaPickerHandle;
  onError?: (error: unknown) => void;
};

type JoditMakeOptions = NonNullable<
  Parameters<(typeof import('jodit'))['Jodit']['make']>[1]
>;

type EditorStatus = 'loading' | 'ready' | 'error';

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  height,
  ariaLabel = 'ویرایشگر متن غنی',
  disabled = false,
  className,
  mediaPicker,
  onError,
}: RichTextEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Jodit | null>(null);
  const [status, setStatus] = useState<EditorStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const onChangeRef = useRef(onChange);
  const mediaPickerRef = useRef(mediaPicker);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onChangeRef.current = onChange;
    mediaPickerRef.current = mediaPicker;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    setStatus('loading');

    const openMediaPicker = (editor: Jodit): void => {
      const handle = mediaPickerRef.current;
      if (!handle) return;
      editor.s.save();
      const snapshot = editor;
      handle.open({
        onInsert: (item) => {
          snapshot.s.restore();
          snapshot.s.insertHTML(buildMediaImageHtml(item));
          snapshot.focus();
          onChangeRef.current(snapshot.value);
        },
        onCancel: () => {
          snapshot.s.restore();
          snapshot.focus();
        },
      });
    };

    void (async () => {
      try {
        const [{ Jodit }] = await Promise.all([
          import('jodit'),
          import('jodit/esm/plugins/indent/indent.js'),
          import('jodit/esm/plugins/justify/justify.js'),
        ]);
        if (disposed) return;
        const profile = buildJoditProfile({
          placeholder,
          height,
          readonly: disabled,
          onChange: (html) => onChangeRef.current(html),
          onInsertMedia: mediaPickerRef.current
            ? (editor) => openMediaPicker(editor)
            : undefined,
        });
        const editor = Jodit.make(host, profile as unknown as JoditMakeOptions);
        editor.value = value;
        editorRef.current = editor;
        setStatus('ready');
      } catch (err) {
        if (disposed) return;
        setError('راه‌اندازی ویرایشگر ناموفق بود.');
        setStatus('error');
        onErrorRef.current?.(err);
      }
    })();

    return () => {
      disposed = true;
      editorRef.current?.destruct();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || status !== 'ready') return;
    if (editor.value === value) return;
    editor.setEditorValue(value);
  }, [value, status]);

  useEffect(() => {
    editorRef.current?.setReadOnly(disabled);
  }, [disabled]);

  return (
    <Box
      className={className}
      data-rich-text-editor=""
      data-status={status}
      role="group"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      {status === 'loading' ? (
        <Box data-testid="rich-text-editor-loading" sx={{ py: 3 }}>
          <Typography variant="body2" color="text.secondary">
            در حال بارگذاری ویرایشگر…
          </Typography>
        </Box>
      ) : null}
      {status === 'error' ? (
        <Alert severity="error" data-testid="rich-text-editor-error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      ) : null}
      <Box ref={hostRef} data-testid="rich-text-editor-host" />
    </Box>
  );
}