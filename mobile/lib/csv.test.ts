// Run with `npm test` from mobile/. CSV (build plan phase 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from './csv.ts';

test('cells: quoted when they must be, quotes doubled, numbers and booleans plain', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell(42), '42');
  assert.equal(csvCell(-5), '-5', 'a negative number is a number, not text');
  assert.equal(csvCell(true), 'true');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(Number.NaN), '');
  assert.equal(csvCell(['a', 'b']), 'a; b');
});

test('a spreadsheet cannot read a title as a formula', () => {
  for (const evil of ['=1+1', '+1', '-1+1', '@SUM(A1)', '\tcmd', '\rx']) {
    const c = csvCell(evil);
    assert.ok(c.startsWith("'") || c.startsWith('"\''), `${JSON.stringify(evil)} -> ${c}`);
  }
  assert.equal(csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
  assert.equal(csvCell('fine = ok'), 'fine = ok');
});

test('rows: a header line, CRLF endings, a trailing newline', () => {
  assert.equal(toCsv(['A', 'B'], [[1, 'x,y'], [2, '']]), 'A,B\r\n1,"x,y"\r\n2,\r\n');
  assert.equal(toCsv(['A'], []), 'A\r\n');
});
