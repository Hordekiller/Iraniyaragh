import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Jodit } from 'jodit';
import { RichTextEditor } from './RichTextEditor';
import type { JoditProfile } from './jodit-profile';
import type { MediaPickerItem } from '@/lib/editor/media-picker';

const state = vi.hoisted(() => {
  const make = vi.fn();
  const setEditorValue = vi.fn();
  const destruct = vi.fn();
  const execCommand = vi.fn();
  const setReadOnly = vi.fn();
  const focus = vi.fn();
  const save = vi.fn();
  const restore = vi.fn();
  const insertHTML = vi.fn();
  const editor = {
    value: '',
    setEditorValue,
    destruct,
    execCommand,
    setReadOnly,
    focus,
    s: { save, restore, insertHTML },
  };
  return {
    make,
    setEditorValue,
    destruct,
    execCommand,
    setReadOnly,
    focus,
    save,
    restore,
    insertHTML,
    editor,
  };
});

vi.mock('jodit', () => ({ Jodit: { make: state.make } }));
vi.mock('jodit/esm/plugins/indent/indent.js', () => ({}));
vi.mock('jodit/esm/plugins/justify/justify.js', () => ({}));

const noop = () => undefined;

const renderEditor = (props: Partial<Parameters<typeof RichTextEditor>[0]> = {}) =>
  render(<RichTextEditor value="" onChange={noop} {...props} />);

const settle = async () => waitFor(() => expect(state.make).toHaveBeenCalled());

const imageItem: MediaPickerItem = {
  id: 'm1',
  url: '/cdn/m1.webp',
  alt: 'alt & quote',
  caption: 'توضیح <i>بلند</i>',
  width: 800,
  height: 600,
};

const triggerImageButton = (): void => {
  const profile = state.make.mock.calls[0][1] as JoditProfile;
  const picker = profile.extraButtons?.find((button) => button.name === 'image');
  expect(picker).toBeDefined();
  picker?.exec?.(state.editor as unknown as Jodit);
};

const openRequest = <T extends Record<string, unknown>>(
  open: ReturnType<typeof vi.fn>,
): T => open.mock.calls[0][0] as T;

describe('RichTextEditor', () => {
  beforeEach(() => {
    state.focus.mockClear();
    state.save.mockClear();
    state.restore.mockClear();
    state.insertHTML.mockClear();
  });

  it('shows a loading placeholder before the editor initializes', () => {
    state.make.mockReturnValue(state.editor);
    renderEditor();
    expect(screen.getByTestId('rich-text-editor-loading')).toBeInTheDocument();
  });

  it('creates the Jodit instance inside the host element with the content profile', async () => {
    state.make.mockReturnValue(state.editor);
    renderEditor({ mediaPicker: { productId: 'p1', open: noop } });
    await settle();
    const [host, profile] = state.make.mock.calls[0] as [HTMLElement, JoditProfile];
    expect(host.dataset.testid).toBe('rich-text-editor-host');
    expect(profile.direction).toBe('rtl');
    expect(profile.uploader?.url).toBe('');
    expect(profile.disablePlugins).toContain('image');
    expect(profile.extraButtons?.some((button) => button.name === 'image')).toBe(true);
    await waitFor(() => expect(screen.queryByTestId('rich-text-editor-loading')).toBeNull());
  });

  it('publishes editor changes through onChange', async () => {
    state.make.mockReturnValue(state.editor);
    const onChange = vi.fn();
    renderEditor({ onChange });
    await settle();
    const profile = state.make.mock.calls[0][1] as JoditProfile;
    profile.events?.['change']?.('<p>نسخه جدید</p>');
    expect(onChange).toHaveBeenCalledWith('<p>نسخه جدید</p>');
  });

  it('seeds the initial value once the editor is ready', async () => {
    state.make.mockReturnValue(state.editor);
    renderEditor({ value: '<h2>عنوان</h2>' });
    await settle();
    expect(state.editor.value).toBe('<h2>عنوان</h2>');
  });

  it('pushes external value updates into the editor without a feedback loop', async () => {
    state.make.mockReturnValue(state.editor);
    state.editor.value = 'first';
    const { rerender } = renderEditor({ value: 'first' });
    await settle();

    rerender(<RichTextEditor value="second" onChange={noop} />);
    await waitFor(() => expect(state.setEditorValue).toHaveBeenCalledWith('second'));

    state.editor.value = 'second';
    rerender(<RichTextEditor value="second" onChange={noop} />);
    expect(state.setEditorValue).toHaveBeenCalledTimes(1);
  });

  it('destroys the editor exactly once on unmount', async () => {
    state.make.mockReturnValue(state.editor);
    const { unmount } = renderEditor();
    await settle();
    unmount();
    expect(state.destruct).toHaveBeenCalledTimes(1);
  });

  it('passes readonly at init and updates it when disabled toggles', async () => {
    state.make.mockReturnValue(state.editor);
    const { rerender } = renderEditor({ value: 'x' });
    await settle();
    expect((state.make.mock.calls[0][1] as JoditProfile).readonly).toBe(false);

    rerender(<RichTextEditor value="x" onChange={noop} disabled />);
    expect(state.setReadOnly).toHaveBeenCalledWith(true);
  });

  it('captures the selection, opens the picker and inserts the public image at the cursor with focus restored', async () => {
    state.make.mockReturnValue(state.editor);
    const open = vi.fn();
    const onChange = vi.fn();
    renderEditor({ mediaPicker: { productId: 'p1', open }, onChange });
    await settle();

    triggerImageButton();

    expect(state.save).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);

    const request = openRequest<{ onInsert: (item: MediaPickerItem) => void; onCancel: () => void }>(open);
    state.editor.value = '<p>متن</p>';
    request.onInsert(imageItem);

    expect(state.restore).toHaveBeenCalledTimes(1);
    expect(state.focus).toHaveBeenCalledTimes(1);
    const inserted = state.insertHTML.mock.calls[0][0] as string;
    expect(inserted).toContain('data-media-id="m1"');
    expect(inserted).toContain('src="/cdn/m1.webp"');
    expect(inserted).toContain('alt="alt &amp; quote"');
    expect(inserted).toContain('title="توضیح &lt;i&gt;بلند&lt;/i&gt;"');
    expect(inserted).toContain('width="800" height="600"');
    expect(inserted).not.toMatch(/X-Amz-|signature|presign|AWSAccessKeyId/i);
    expect(onChange).toHaveBeenCalledWith('<p>متن</p>');
  });

  it('cancelling the picker leaves the content untouched and restores selection and focus', async () => {
    state.make.mockReturnValue(state.editor);
    const open = vi.fn();
    renderEditor({ mediaPicker: { productId: 'p1', open } });
    await settle();

    triggerImageButton();
    const request = openRequest<{ onInsert: (item: MediaPickerItem) => void; onCancel: () => void }>(open);
    request.onCancel();

    expect(state.insertHTML).not.toHaveBeenCalled();
    expect(state.focus).toHaveBeenCalledTimes(1);
    expect(state.restore).toHaveBeenCalledTimes(1);
  });

  it('opens the adapter directly with no Jodit popup or nested modal', async () => {
    state.make.mockReturnValue(state.editor);
    const open = vi.fn();
    renderEditor({ mediaPicker: { productId: 'p1', open } });
    await settle();

    triggerImageButton();

    expect(open).toHaveBeenCalledTimes(1);
    expect(state.execCommand).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a no-op on the media toolbar without a media picker handle', async () => {
    state.make.mockReturnValue(state.editor);
    renderEditor();
    await settle();
    const profile = state.make.mock.calls[0][1] as JoditProfile;
    expect(profile.extraButtons?.some((button) => button.name === 'image')).toBe(false);
  });

  it('renders an error fallback and reports init failures when Jodit throws', async () => {
    state.make.mockImplementation(() => {
      throw new Error('jodit init failed');
    });
    const onError = vi.fn();
    renderEditor({ onError });
    await waitFor(() =>
      expect(screen.getByTestId('rich-text-editor-error')).toBeInTheDocument(),
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(screen.queryByTestId('rich-text-editor-loading')).toBeNull();
  });
});