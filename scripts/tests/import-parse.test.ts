/**
 * Bulk knowledge import parser: formats, splitting, CSV edge cases, limits.
 * Run: pnpm test:unit
 */
import assert from 'node:assert/strict';
import {
  IMPORT_MAX_CONTENT_CHARS,
  parseCsvRows,
  parseImportFile
} from '../../lib/knowledge/import-parse';

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log('Import parser');

check('markdown: first H1 is the title and is removed from the content', () => {
  const [doc] = parseImportFile('refunds.md', '# Refund policy\n\nRefunds take 5 days.\n', 'guide');
  assert.equal(doc.title, 'Refund policy');
  assert.equal(doc.content, 'Refunds take 5 days.');
  assert.equal(doc.type, 'guide');
  assert.equal(doc.problem, undefined);
});

check('text without a heading uses the file name; BOM and CRLF are handled', () => {
  const [doc] = parseImportFile('C:\\docs\\Porting-out.txt', '\uFEFFLine one\r\nLine two', 'procedure');
  assert.equal(doc.title, 'Porting-out');
  assert.equal(doc.content, 'Line one\nLine two');
  assert.equal(doc.type, 'procedure');
});

check('two or more H1 headings split into one document each', () => {
  const docs = parseImportFile('handbook.md', '# A\nalpha\n\n# B\nbeta\n## sub\nstill B', 'faq');
  assert.deepEqual(docs.map((d) => d.title), ['A', 'B']);
  assert.equal(docs[1].content, 'beta\n## sub\nstill B');
});

check('a "# " line inside a code fence does not split', () => {
  const docs = parseImportFile('x.md', '# Only\n```\n# not a heading\n```\nend', 'guide');
  assert.equal(docs.length, 1);
  assert.ok(docs[0].content.includes('# not a heading'));
});

check('empty content and missing title are reported, not imported silently', () => {
  assert.equal(parseImportFile('empty.md', '# Title only\n', 'guide')[0].problem, 'Empty content');
  const csv = parseImportFile('k.csv', 'title,content\n,body', 'guide');
  assert.equal(csv[0].problem, 'Missing title');
});

check('over-long content is flagged', () => {
  const [doc] = parseImportFile('big.txt', 'x'.repeat(IMPORT_MAX_CONTENT_CHARS + 1), 'guide');
  assert.match(doc.problem ?? '', /Content longer/);
});

check('csv: quoted commas, doubled quotes and embedded line breaks', () => {
  const csv = 'title,type,content\n"Refunds, general",faq,"Say ""no"" to\nfraud"\nPorting,procedure,Step 1';
  const docs = parseImportFile('kb.csv', csv, 'guide');
  assert.equal(docs.length, 2);
  assert.equal(docs[0].title, 'Refunds, general');
  assert.equal(docs[0].type, 'faq');
  assert.equal(docs[0].content, 'Say "no" to\nfraud');
  assert.equal(docs[1].type, 'procedure');
});

check('csv: unknown or missing type falls back to the default; columns in any order', () => {
  const docs = parseImportFile('kb.csv', 'content,title,type\nBody,Name,wiki', 'guide');
  assert.equal(docs[0].title, 'Name');
  assert.equal(docs[0].type, 'guide');
});

check('csv without title/content headers is rejected with a clear message', () => {
  const [doc] = parseImportFile('bad.csv', 'a,b\n1,2', 'guide');
  assert.match(doc.problem ?? '', /header row/);
});

check('csv: blank lines ignored; no trailing newline needed', () => {
  assert.deepEqual(parseCsvRows('a,b\n\n1,2'), [['a', 'b'], ['1', '2']]);
});

if (failures > 0) {
  console.error(`\nimport-parse.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nimport-parse.test.ts: all checks passed');
