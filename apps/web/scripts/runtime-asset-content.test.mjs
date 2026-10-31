import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { contentToInspect } from './runtime-asset-content.mjs';

const file = fileURLToPath(new URL('../src/pages/ProductPage.tsx', import.meta.url));
const robots = fileURLToPath(new URL('../public/robots.txt', import.meta.url));
const sitemap = fileURLToPath(new URL('../public/sitemap.xml', import.meta.url));
const html = fileURLToPath(new URL('../index.html', import.meta.url));

test('allows schema context and conditional availability identifiers only as metadata values', () => {
  const source = "const data = { '@context': 'https://schema.org', availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' };";
  assert.doesNotMatch(contentToInspect(file, source), /https?:\/\//);
});

test('keeps identical schema URLs when used as runtime resources or executable calls', () => {
  for (const source of [
    '<img src="https://schema.org/InStock" />',
    "fetch('https://schema.org/InStock')",
    "const data = { availability: fetch('https://schema.org/InStock') };",
    "const data = { image: 'https://schema.org/InStock' };",
    "const data = { availability: 'https://cdn.example/image.png' };",
    "const data = { availability: fetch('https://schema.org/InStock') ? true : false };",
  ]) assert.match(contentToInspect(file, source), /https:\/\//);
});

test('does not exempt a JSX attribute named availability', () => {
  assert.match(contentToInspect(file, '<img availability="https://schema.org/InStock" />'), /https:\/\//);
});

test('allows valid inline JSON-LD while preserving a script resource URL', () => {
  const source = '<script type="application/ld+json" src="https://cdn.example/data.json">{"@context":"https://schema.org","url":"https://iraniyaragh.com"}</script>';
  const result = contentToInspect(html, source);
  assert.match(result, /https:\/\/cdn\.example\/data\.json/);
  assert.doesNotMatch(result, /schema\.org|iraniyaragh\.com/);
});

test('keeps malformed JSON-LD and executable script content inspected', () => {
  for (const source of [
    '<script type="application/ld+json">{"url":"https://cdn.example"</script>',
    '<script type="text/javascript">fetch("https://cdn.example")</script>',
    '<img src="https://iraniyaragh.com/brand/logo.png" />',
  ]) assert.match(contentToInspect(html, source), /https:\/\//);
});

test('allows only the canonical sitemap declaration in the shipped robots file', () => {
  assert.doesNotMatch(contentToInspect(robots, 'Sitemap: https://iraniyaragh.com/sitemap.xml\n'), /https:\/\//);
  assert.match(contentToInspect(file, 'Sitemap: https://iraniyaragh.com/sitemap.xml'), /https:\/\//);
  assert.match(contentToInspect(robots, 'Sitemap: https://iraniyaragh.com.evil.example/sitemap.xml'), /https:\/\//);
});

test('allows canonical sitemap locations but preserves offsite locations and resource URLs', () => {
  const result = contentToInspect(sitemap, '<url><loc>https://iraniyaragh.com/categories</loc><image>https://cdn.example/item.png</image></url><url><loc>https://other.example/</loc></url>');
  assert.doesNotMatch(result, /https:\/\/iraniyaragh\.com\//);
  assert.match(result, /https:\/\/cdn\.example\/item\.png/);
  assert.match(result, /https:\/\/other\.example\//);
  assert.match(contentToInspect(file, '<loc>https://iraniyaragh.com/</loc>'), /https:\/\//);
});
