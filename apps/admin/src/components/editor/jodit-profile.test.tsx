import { describe, expect, it, vi } from 'vitest';
import type { Jodit } from 'jodit';
import {
  buildJoditProfile,
  RICH_TEXT_DISABLED_PLUGINS,
  RICH_TEXT_HEADINGS,
} from './jodit-profile';

const makeEditor = () => ({ execCommand: vi.fn() }) as unknown as Jodit;

describe('buildJoditProfile', () => {
  it('enables RTL content direction for Persian authoring', () => {
    expect(buildJoditProfile().direction).toBe('rtl');
  });

  it('maps numeric height to pixels and passes string height through', () => {
    expect(buildJoditProfile({ height: 300 }).height).toBe('300px');
    expect(buildJoditProfile({ height: '100%' }).height).toBe('100%');
  });

  it('propagates placeholder and readonly', () => {
    const profile = buildJoditProfile({ placeholder: 'متن توضیحات', readonly: true });
    expect(profile.placeholder).toBe('متن توضیحات');
    expect(profile.readonly).toBe(true);
  });

  it('applies the exact disabled plugin list (uploader, file browser, image dialog)', () => {
    const profile = buildJoditProfile();
    expect(profile.disablePlugins).toEqual([...RICH_TEXT_DISABLED_PLUGINS]);
    expect(profile.disablePlugins).toContain('file');
    expect(profile.disablePlugins).toContain('image');
    expect(profile.disablePlugins).toContain('about');
  });

  it('disables the uploader connector and base64 image embedding', () => {
    const profile = buildJoditProfile();
    expect(profile.uploader).toEqual({ url: '', insertImageAsBase64URI: false });
  });

  it('exposes the required toolbar controls and keeps uploading ones out', () => {
    const profile = buildJoditProfile();
    expect(profile.buttons).toContain('paragraph');
    expect(profile.buttons).toContain('bold');
    expect(profile.buttons).toContain('italic');
    expect(profile.buttons).toContain('underline');
    expect(profile.buttons).toContain('strikethrough');
    expect(profile.buttons).toContain('ul');
    expect(profile.buttons).toContain('ol');
    expect(profile.buttons).toContain('align');
    expect(profile.buttons).toContain('brush');
    expect(profile.buttons).toContain('link');
    expect(profile.buttons).toContain('table');
    expect(profile.buttons).toContain('undo');
    expect(profile.buttons).toContain('redo');
    expect(profile.buttons).not.toContain('image');
    expect(profile.buttons).not.toContain('file');
  });

  it('registers an explicit blockquote control with formatBlock command', () => {
    const profile = buildJoditProfile();
    const blockquote = profile.extraButtons?.find((button) => button.name === 'blockquote');
    expect(blockquote).toBeDefined();
    const editor = makeEditor();
    blockquote?.exec?.(editor);
    expect(editor.execCommand).toHaveBeenCalledWith('formatBlock', false, 'blockquote');
  });

  it('adds the media picker control only when an insert handler is provided', () => {
    const without = buildJoditProfile();
    expect(without.extraButtons?.some((button) => button.name === 'imagePicker')).toBe(false);

    const onInsertMedia = vi.fn();
    const withHandler = buildJoditProfile({ onInsertMedia });
    const picker = withHandler.extraButtons?.find((button) => button.name === 'imagePicker');
    expect(picker).toBeDefined();
    const editor = makeEditor();
    picker?.exec?.(editor);
    expect(onInsertMedia).toHaveBeenCalledWith(editor);
  });

  it('brands the media control and confirms upload plugins stay disabled', () => {
    const profile = buildJoditProfile({ onInsertMedia: vi.fn() });
    const picker = profile.extraButtons?.find((button) => button.name === 'imagePicker');
    expect(picker?.icon).toBe('image');
    expect(picker?.tooltip).toContain('IranYaragh');
  });

  it('keeps paste-HTML enabled while dropping the paste confirmation prompt', () => {
    const profile = buildJoditProfile();
    expect(profile.askBeforePasteHTML).toBe(false);
    expect(profile.processPasteHTML).toBe(true);
  });

  it('hides the statusbar xpath readout', () => {
    expect(buildJoditProfile().showXPathInStatusbar).toBe(false);
  });

  it('exposes full H1-H6 heading options via the paragraph control', () => {
    const profile = buildJoditProfile();
    expect(profile.controls?.paragraph?.list).toEqual(RICH_TEXT_HEADINGS);
    expect(profile.controls?.paragraph?.list).toMatchObject({
      h1: expect.any(String),
      h2: expect.any(String),
      h3: expect.any(String),
      h4: expect.any(String),
      h5: expect.any(String),
      h6: expect.any(String),
      blockquote: expect.any(String),
    });
  });

  it('forwards jodit change events through the onChange callback', () => {
    const onChange = vi.fn();
    const profile = buildJoditProfile({ onChange });
    const change = profile.events?.['change'];
    expect(change).toBeTypeOf('function');
    change?.('<p>new html</p>', '<p>old</p>');
    expect(onChange).toHaveBeenCalledWith('<p>new html</p>');
  });

  it('does not register change events when no onChange is provided', () => {
    expect(buildJoditProfile().events).toBeUndefined();
  });
});