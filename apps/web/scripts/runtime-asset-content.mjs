import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROBOTS_FILE = fileURLToPath(new URL('../public/robots.txt', import.meta.url));
const SITEMAP_FILE = fileURLToPath(new URL('../public/sitemap.xml', import.meta.url));
const LEGAL_TXT = /(?:^|\/)(OFL\.txt|LICEN[CS]E.*|NOTICE.*|COPYING.*)$/i;

// A vocabulary identifier is permitted only as the value of its metadata field.
// Identical URLs in JSX src, CSS, fetch() or unrelated values remain inspected.
function isSchemaIdentifier(node) {
  const context = /^https?:\/\/schema\.org$/.test(node.text);
  const availability = /^https:\/\/schema\.org\/(?:InStock|OutOfStock)$/.test(node.text);
  if (!context && !availability) return false;
  let expression = node;
  while (expression.parent) {
    const parent = expression.parent;
    if (ts.isParenthesizedExpression(parent)) {
      expression = parent;
    } else if (availability && ts.isConditionalExpression(parent) && (parent.whenTrue === expression || parent.whenFalse === expression)) {
      expression = parent;
    } else if (ts.isPropertyAssignment(parent) && parent.initializer === expression) {
      const name = parent.name.getText().replace(/^['"]|['"]$/g, '');
      return context ? name === '@context' : name === 'availability';
    } else return false;
  }
  return false;
}

function removeSchemaIdentifiers(file, content) {
  const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, kind);
  const ranges = [];
  function visit(node) {
    if (ts.isStringLiteral(node) && isSchemaIdentifier(node)) ranges.push([node.getStart(source), node.end]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  let result = content;
  for (const [start, end] of ranges.reverse()) result = result.slice(0, start) + '""' + result.slice(end);
  return result;
}

export function contentToInspect(file, content) {
  if (LEGAL_TXT.test(file)) return '';
  let result = content.replace(/xmlns(?::\w+)?="(?:https?:\/\/[^"]*)"/g, '');
  if (/\.[cm]?[jt]sx?$/.test(file)) result = removeSchemaIdentifiers(file, result);
  if (/\.html$/.test(file)) {
    // Valid inline JSON-LD is a data block, not an executable/resource request.
    // Preserve the opening tag so an external src attribute still fails policy.
    result = result.replace(/(<script\b[^>]*\btype\s*=\s*['"]application\/ld\+json['"][^>]*>)([\s\S]*?)(<\/script>)/gi, (block, open, data, close) => {
      try { JSON.parse(data); return open + close; } catch { return block; }
    });
  }
  // Search-discovery declarations point to the canonical site, never an asset.
  // Keep these exceptions scoped to the two shipped files and their exact host.
  if (file === ROBOTS_FILE) result = result.replace(/^Sitemap:\s*https:\/\/iraniyaragh\.com\/sitemap\.xml\s*$/gm, '');
  if (file === SITEMAP_FILE) result = result.replace(/<loc>https:\/\/iraniyaragh\.com\/[^<\s]*<\/loc>/g, '');
  return result;
}
