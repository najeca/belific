'use strict';
// Keys the page may not touch through the plain kv IPC (L4): the encrypted
// session files, and the flag main uses to take the first sign in backup once.
const { FLAG_KEY } = require('./firstSignin');
const { SECURE_PREFIX } = require('./kvstore');

function assertRendererKey(key) {
  const k = String(key);
  if (k.startsWith(SECURE_PREFIX) || k === FLAG_KEY) throw new Error('Reserved storage key');
  return key;
}

module.exports = { assertRendererKey };
