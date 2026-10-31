import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import { sanitizeDescriptionFragment, rewriteDescriptionImages } from './content-sanitizer';
import { descriptionInlineStyle } from './description-layout';

// Owner-provided HTML is a regression fixture, never seeded into sales data.
const example = readFileSync(resolve(__dirname, 'fixtures/user-supplied-hinge-layout.html'), 'utf8');

describe('bounded product description layout profile', () => {
  it('preserves the supplied responsive design, semantic FAQ, anchors and exact typography on repeated reads', () => {
    const html = sanitizeDescriptionFragment(example).html!;
    expect(html).toContain('<article id="iyc-iy-hg1135"');
    expect(html).toContain('class="iy-panel iy-hero"');
    expect(html).toContain('href="#iyc-iy-hg1135-specs"');
    expect(html).toContain('<details>');
    expect(html).toContain('<summary>');
    expect(html).toContain('grid-template-columns:1.13fr .87fr');
    expect(html).toContain('font-weight:850');
    expect(html).toContain('linear-gradient(125deg,#eef5ff,#fff 60%,#edf3f9)');
    expect(html).toContain('@media (max-width:820px)');
    expect(html).toContain('@media (max-width:480px)');
    expect(html).not.toContain('store128.com');
    expect(sanitizeDescriptionFragment(html).html).toBe(html);
    const css = html.slice('<style>'.length, html.indexOf('</style>'));
    postcss.parse(css).walkRules(rule => {
      expect(rule.selector.split(',').every(selector => selector.startsWith('[data-rich-text="true"] '))).toBe(true);
    });
  });

  it('rejects global selectors, external resources, arbitrary attributes/pseudos and position escapes', () => {
    const html = sanitizeDescriptionFragment(`<style>
      @import 'https://evil.example/x.css';
      @font-face{font-family:bad;src:url(https://evil.example/font)}
      body{display:none}html{background:red}
      #panel{position:fixed;z-index:999999;background:url(https://evil.example/a);color:#123456}
      #panel:has(input){color:red}a[href]{background:red}
      #panel:hover{color:#654321}
      @media (max-width:480px){#panel{display:grid}}
    </style><section id="panel" onclick="steal()">test</section>`).html!;
    expect(html).toContain('[data-rich-text="true"] #iyc-panel{color:#123456}');
    expect(html).toContain('#iyc-panel:hover{color:#654321}');
    expect(html).toContain('@media (max-width:480px)');
    expect(html).not.toMatch(/evil\.example|@import|@font-face|position:fixed|z-index|:has|\[href\]|onclick|body\{|html\{/u);
  });

  it('keeps safe inline presentation while refusing network, script and custom-property values', () => {
    expect(descriptionInlineStyle('display:grid;gap:12px;font-weight:850;position:relative')).toBe('display:grid;gap:12px;font-weight:850;position:relative');
    for (const style of ['background:url(https://evil.example)', 'color:expression(alert(1))', 'background:u\\72l(https://evil.example)', 'width:var(--private)', '--private:red', 'position:sticky', 'height:999999px', 'height:1e9px', 'grid-template-columns:repeat(999,1fr)', 'grid-template-columns:repeat(1e3,1fr)', 'color:red!important']) {
      expect(descriptionInlineStyle(style), style).toBe('');
    }
  });

  it('drops malformed CSS without turning safe body content into raw CSS or HTML', () => {
    expect(sanitizeDescriptionFragment('<style>#panel{color:red</style><p>safe</p>').html).toBe('<p>safe</p>');
    expect(sanitizeDescriptionFragment('<style>#panel{content:"</style><script>steal()</script><p>safe</p>').html).not.toMatch(/<script|steal\(\)/u);
  });

  it('namespaces IDs and fragment links and rejects malformed selectors or presentation attributes', () => {
    const longId = 'x'.repeat(100);
    const html = sanitizeDescriptionFragment(`<style>>p{color:red}#${'x'.repeat(2100)}{color:red}.ok{display:contents;cursor:steal;transition:transform 999s;font-family:remote;content:'bad'}</style><section id="${longId}"><a href="#${longId}">ok</a><p id="bad/id" class="ok invalid:class" style="position:fixed">test</p><a href="#bad/id">bad</a></section>`).html!;
    expect(html).toContain(`id="iyc-${longId}"`);
    expect(html).toContain(`href="#iyc-${longId}"`);
    expect(html).toContain('<p class="ok">test</p>');
    expect(html).not.toContain('<style>');
    expect(html).not.toContain('href="#bad/id"');
    expect(sanitizeDescriptionFragment(html).html).toBe(html);
  });

  it('resolves images exclusively through owned media while retaining safe layout attributes', () => {
    const html = sanitizeDescriptionFragment('<img data-media-id="test-image" src="https://evil.example/a" class="iy-photo" style="object-fit:cover;width:100%;position:fixed">').html!;
    const rewritten = rewriteDescriptionImages(html, [{ id: 'test-image', url: '/public-media/test.webp', width: 750, height: 500, alt: 'تصویر آزمایشی' }]);
    expect(rewritten).toContain('src="/public-media/test.webp" width="750" height="500"');
    expect(rewritten).toContain('class="iy-photo" style="object-fit:cover;width:100%"');
    expect(rewritten).not.toMatch(/evil\.example|fixed/u);
  });
});
