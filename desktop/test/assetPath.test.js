'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveAssetPath } = require('../src/assetPath');

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'belific-export-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<html></html>');
  fs.mkdirSync(path.join(root, '_expo', 'static', 'js'), { recursive: true });
  fs.writeFileSync(path.join(root, '_expo', 'static', 'js', 'app.js'), '//');
  fs.writeFileSync(path.join(path.dirname(root), 'secret.txt'), 'secret');
  return root;
}

test('serves real files and the root', () => {
  const root = makeRoot();
  assert.equal(resolveAssetPath(root, '/_expo/static/js/app.js'), path.join(root, '_expo', 'static', 'js', 'app.js'));
  assert.equal(resolveAssetPath(root, '/'), path.join(root, 'index.html'));
  assert.equal(resolveAssetPath(root, '/index.html'), path.join(root, 'index.html'));
});

test('unknown app routes fall back to index.html', () => {
  const root = makeRoot();
  assert.equal(resolveAssetPath(root, '/today'), path.join(root, 'index.html'));
  assert.equal(resolveAssetPath(root, '/(tabs)/calendar'), path.join(root, 'index.html'));
});

test('a missing file with an extension is a 404, not index.html', () => {
  const root = makeRoot();
  assert.equal(resolveAssetPath(root, '/_expo/static/js/missing.js'), null);
});

test('path traversal is refused', () => {
  const root = makeRoot();
  const attempts = [
    '/../secret.txt',
    '/..%2Fsecret.txt',
    '/%2e%2e/secret.txt',
    '/_expo/../../secret.txt',
    '/..\\secret.txt',
    '/%00',
    '/%E0%A4%A',
  ];
  for (const attempt of attempts) {
    const resolved = resolveAssetPath(root, attempt);
    assert.ok(
      resolved === null || resolved.startsWith(root + path.sep),
      `${attempt} resolved outside the root: ${resolved}`,
    );
    assert.notEqual(resolved, path.join(path.dirname(root), 'secret.txt'));
  }
  assert.equal(resolveAssetPath(root, '/../secret.txt'), null);
});
