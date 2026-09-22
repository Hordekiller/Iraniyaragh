import { describe, expect, it } from 'vitest';
import { richTextToPlainText } from './rich-text';

describe('richTextToPlainText', () => {
  it('returns an empty string for empty or null content', () => {
    expect(richTextToPlainText(null)).toBe('');
    expect(richTextToPlainText(undefined)).toBe('');
    expect(richTextToPlainText('')).toBe('');
    expect(richTextToPlainText('   ')).toBe('');
  });

  it('strips markup and decodes entities to visible text', () => {
    expect(
      richTextToPlainText(
        '<h2>ویژگی‌ها</h2><p>متن <strong>پررنگ</strong> و <em>کج</em>.</p>',
      ),
    ).toBe('ویژگی‌ها متن پررنگ و کج.');
  });

  it('normalizes repeated whitespace and newlines', () => {
    expect(
      richTextToPlainText('<p>سطر اول</p>\n\n<p>سطر   دوم</p>'),
    ).toBe('سطر اول سطر دوم');
  });

  it('includes image alt text when present', () => {
    expect(
      richTextToPlainText(
        '<p>توضیح <img src="/x.jpg" alt="نمودار عملکرد"> پایان</p>',
      ),
    ).toBe('توضیح نمودار عملکرد پایان');
  });

  it('never leaks attribute markup or script content confidence into text', () => {
    expect(
      richTextToPlainText('<p onclick="let()">متن امن</p><script>var x=1</script>'),
    ).toBe('متن امن');
  });
});