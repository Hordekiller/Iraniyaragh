import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Jodit } from 'jodit';
import 'jodit/esm/plugins/source/source.js';
import 'jodit/esm/plugins/clean-html/clean-html.js';
import { MODE_SOURCE, MODE_WYSIWYG } from 'jodit/esm/core/constants.js';
import { buildJoditProfile } from './jodit-profile';
import { preserveRawHtmlSource } from './raw-html-source';

const editors: Jodit[] = [];

beforeEach(() => {
  vi.spyOn(window, 'focus').mockImplementation(() => undefined);
});

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destruct());
  document.body.innerHTML = '';
});

async function makeEditor(onChange = vi.fn()) {
  const host = document.createElement('textarea');
  document.body.append(host);
  const editor = Jodit.make(host, {
    ...buildJoditProfile({ onChange, placeholder: '', height: 300 }),
    toolbar: false,
    saveModeInStorage: false,
  } as Parameters<typeof Jodit.make>[1]);
  editors.push(editor);
  preserveRawHtmlSource(editor);
  await editor.waitForReady();
  editor.value = '<p>متن اولیه</p>';
  editor.setMode(MODE_SOURCE);
  const source = editor.container.querySelector<HTMLTextAreaElement>(
    'textarea.jodit-source__mirror',
  )!;
  onChange.mockClear();
  return { editor, source, onChange };
}

describe('raw HTML source with the bundled Jodit engine', () => {
  it('publishes the exact raw draft immediately and after DOM synchronization', async () => {
    const { editor, source, onChange } = await makeEditor();
    const html = "<!-- توضیح -->\n<DIV data-custom='x' dir='rtl'><b>متن&nbsp;</b><span></span><br /></DIV>\n<table><tr><td>مقدار</td></tr></table>";
    source.value = html;
    source.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith(html);
    expect(editor.value).toBe(html);
    await new Promise((resolve) => setTimeout(resolve, editor.defaultTimeout + 50));
    expect(editor.value).toBe(html);
    expect(source.value).toBe(html);
    expect(onChange).toHaveBeenLastCalledWith(html);
  });

  it('preserves incomplete tags while typing and accepts external replacements', async () => {
    const { editor, source, onChange } = await makeEditor();
    source.value = '<p>متن</p>\n<table data-';
    source.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith(source.value);
    editor.setEditorValue('<h2 dir="rtl">نسخه سرور</h2>');
    expect(source.value).toBe('<h2 dir="rtl">نسخه سرور</h2>');
    expect(editor.value).toBe(source.value);
    editor.setEditorValue('');
    expect(source.value).toBe('');
    expect(editor.value).toBe('');
  });

  it('keeps raw markup through a controlled form echo without recursive changes', async () => {
    const { editor, source, onChange } = await makeEditor();
    onChange.mockImplementation((html: string) => editor.setEditorValue(html));
    const html = "<p dir='rtl'>متن&nbsp;<br /></p>";
    source.value = html;
    source.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(html);
    expect(source.value).toBe(html);
    expect(editor.value).toBe(html);
  });

  it('keeps selection on echoed values and does not leak mode-switch markers', async () => {
    const { editor, source, onChange } = await makeEditor();
    const html = '<p>متن جدید</p>';
    source.value = html;
    source.setSelectionRange(4, 6);
    source.dispatchEvent(new Event('input', { bubbles: true }));
    editor.setEditorValue(html);
    expect(source.selectionStart).toBe(4);
    expect(source.selectionEnd).toBe(6);
    editor.setMode(MODE_WYSIWYG);
    editor.setMode(MODE_SOURCE);
    expect(source.value).not.toContain('jodit-selection_marker');
    expect(onChange.mock.calls.every(([value]) => !value.includes('jodit-selection_marker'))).toBe(true);
  });

  it('retains raw source without disabling sanitization in the visual editor', async () => {
    const { editor, source } = await makeEditor();
    const html = '<p onclick="alert(1)">متن</p><a href="javascript:alert(1)">پیوند</a>';
    source.value = html;
    source.dispatchEvent(new Event('input', { bubbles: true }));
    editor.setEditorValue(html);
    expect(editor.value).toBe(html);
    expect(editor.editor.innerHTML).not.toContain('onclick');
    expect(editor.editor.querySelector('a')?.getAttribute('href')).not.toBe('javascript:alert(1)');
    expect(editor.element.tagName).toBe('TEXTAREA');
    expect((editor.element as HTMLTextAreaElement).value).toBe(html);
  });
});
