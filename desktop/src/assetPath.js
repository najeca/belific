'use strict';
// Maps a request path on app://belific/ to a file inside the export
// folder, or null if it would escape the folder. Unknown paths fall back
// to index.html (expo-router handles routes client side).
const fs = require('node:fs');
const path = require('node:path');

function resolveAssetPath(root, urlPathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPathname || '/');
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = decoded.replace(/^[\\/]+/, '');
  const rootResolved = path.resolve(root);
  const candidate = path.resolve(rootResolved, relative);
  const inside = candidate === rootResolved || candidate.startsWith(rootResolved + path.sep);
  if (!inside) return null;
  try {
    if (fs.statSync(candidate).isFile()) return candidate;
  } catch {
    // not a file: fall through to the SPA fallback
  }
  // A missing path that looks like a file (has an extension) is a real 404,
  // anything else is an app route.
  if (path.extname(relative)) return null;
  return path.join(rootResolved, 'index.html');
}

module.exports = { resolveAssetPath };
