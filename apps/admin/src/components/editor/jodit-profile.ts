import type { Jodit } from 'jodit';

export type JoditProfile = {
  direction?: 'rtl' | 'ltr' | '';
  height?: number | string;
  placeholder?: string;
  readonly?: boolean;
  disablePlugins?: string[];
  uploader?: { url?: string; insertImageAsBase64URI?: boolean };
  buttons?: string[];
  extraButtons?: Array<{
    name?: string;
    text?: string;
    tooltip?: string;
    icon?: string;
    exec?: (editor: Jodit) => void;
  }>;
  events?: Record<string, (...args: unknown[]) => void>;
  controls?: { paragraph?: { list?: Record<string, string> } };
  showXPathInStatusbar?: boolean;
  askBeforePasteHTML?: boolean;
  processPasteHTML?: boolean;
};

export type JoditProfileOptions = {
  placeholder?: string;
  height?: number | string;
  readonly?: boolean;
  onChange?: (html: string) => void;
  onInsertMedia?: (editor: Jodit) => void;
};

export const RICH_TEXT_DISABLED_PLUGINS = [
  'about',
  'ai-assistant',
  'file',
  'fullsize',
  'iframe',
  'image',
  'image-properties',
  'media',
  'powered-by-jodit',
  'preview',
  'print',
  'source',
  'speech-recognize',
  'video',
] as const;

export const RICH_TEXT_HEADINGS: Record<string, string> = {
  p: 'Paragraph',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
  blockquote: 'Quote',
  pre: 'Code',
};

const RICH_TEXT_TOOLBAR = [
  'undo',
  'redo',
  'paragraph',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'ul',
  'ol',
  'outdent',
  'indent',
  'align',
  'brush',
  'link',
  'table',
] as const;

export function buildJoditProfile(options: JoditProfileOptions = {}): JoditProfile {
  const extraButtons: NonNullable<JoditProfile['extraButtons']> = [
    {
      name: 'blockquote',
      icon: 'paragraph',
      tooltip: 'Blockquote',
      exec: (editor) => {
        editor.execCommand('formatBlock', false, 'blockquote');
      },
    },
  ];

  if (options.onInsertMedia) {
    extraButtons.push({
      name: 'imagePicker',
      icon: 'image',
      tooltip: 'Insert media from the IranYaragh library',
      exec: (editor) => {
        options.onInsertMedia?.(editor);
      },
    });
  }

  return {
    direction: 'rtl',
    height: typeof options.height === 'number' ? `${options.height}px` : options.height,
    placeholder: options.placeholder,
    readonly: options.readonly,
    disablePlugins: [...RICH_TEXT_DISABLED_PLUGINS],
    uploader: { url: '', insertImageAsBase64URI: false },
    buttons: [...RICH_TEXT_TOOLBAR],
    extraButtons,
    events: options.onChange
      ? {
          change: (...args: unknown[]) => {
            options.onChange?.(String(args[0] ?? ''));
          },
        }
      : undefined,
    controls: { paragraph: { list: { ...RICH_TEXT_HEADINGS } } },
    showXPathInStatusbar: false,
    askBeforePasteHTML: false,
    processPasteHTML: true,
  };
}