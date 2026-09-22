/**
 * Serialize structured data for safe embedding inside a
 * `<script type="application/ld+json">` element.
 *
 * `JSON.stringify` does not escape `<`, `>` or `&`, so attacker-influenced
 * text fields (e.g. a rich-text description projection) could terminate the
 * script tag with a literal `</script>` and reinterpret the remainder as HTML.
 * Escaping these characters to JSON unicode escapes preserves the parsed JSON
 * value while making the payload inert inside an HTML script element.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}