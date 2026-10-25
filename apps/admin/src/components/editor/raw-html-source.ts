import type { Jodit } from 'jodit';
import { MODE_SOURCE, SOURCE_CONSUMER } from 'jodit/esm/core/constants.js';

/** Keep the textarea authoritative while Jodit is in source mode. */
export function preserveRawHtmlSource(editor: Jodit): void {
  const source = editor.container.querySelector<HTMLTextAreaElement>(
    'textarea.jodit-source__mirror',
  );
  if (!source) throw new Error('Jodit textarea source editor is unavailable');

  editor.e.on('beforeGetValueFromEditor', (consumer?: string) => {
    if (editor.getMode() !== MODE_SOURCE) return;
    // Jodit's source plugin needs its markers during a mode switch. Consumers
    // such as React and the form must never receive those internal spans.
    return consumer === SOURCE_CONSUMER
      ? source.value
      : source.value.replace(
          /<span\b[^>]*\bid=["']jodit-selection_marker_[^"']*["'][^>]*>[\s\uFEFF]*<\/span>/gi,
          '',
        );
  });

  editor.e.on('beforeSetValueToEditor', (html?: string) => {
    if (editor.getMode() === MODE_SOURCE && typeof html === 'string') {
      // External values and undo/redo must update the source too. Avoid assigning
      // an echoed value, which would reset the textarea's selection on each edit.
      if (source.value !== html) source.value = html;
    }
  });

  // The bundled source engine debounces its DOM synchronization. Publish the
  // raw draft immediately, including when Save is clicked before that debounce.
  editor.e.on(source, 'input', () => {
    if (!editor.getReadOnly()) editor.setEditorValue();
  });
}
