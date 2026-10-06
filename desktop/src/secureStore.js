'use strict';
// Encrypted store for the Supabase session (decision 012). The encryption is
// injected (Electron safeStorage in main, a fake in tests): { isAvailable(),
// encrypt(string) -> Buffer, decrypt(Buffer) -> string }.
//
// Values are kept in memory for this run and persisted, encrypted, through
// the file store. If encryption is unavailable, or fails, nothing is written:
// the value lives in memory only, setItem resolves { persisted: false } and
// `persistent` turns false so Settings shows the warning. A tampered or
// undecryptable file reads as "no value", never as plain text.
//
// PKCE code verifiers (keys ending in `code-verifier`) are NEVER written to
// disk (cp6.1): a sign in only lives for this run, so a file could only be a
// stale leftover. They are held in memory, can be snapshotted and restored
// (so a failed exchange does not destroy a real sign in) and wiped.
const crypto = require('node:crypto');

const PREFIX = 'v1:';
const VERIFIER = /code-verifier$/;

function fileKey(key) {
  return 'secure.' + crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 40);
}

class SecureStore {
  constructor(kv, cipher, onError = () => {}) {
    this.kv = kv;
    this.cipher = cipher;
    this.onError = onError;
    this.memory = new Map();
    this.degraded = false;
  }

  _available() {
    try {
      return this.cipher.isAvailable() === true;
    } catch {
      return false;
    }
  }

  // True when values survive a restart.
  get persistent() {
    return this._available() && !this.degraded;
  }

  async getItem(key) {
    if (this.memory.has(key)) return this.memory.get(key);
    if (VERIFIER.test(key) || !this._available()) return null;
    let stored;
    try {
      stored = await this.kv.getItem(fileKey(key));
    } catch (err) {
      this.onError(err, 'secure read');
      return null;
    }
    if (!stored || !stored.startsWith(PREFIX)) return null;
    try {
      const value = this.cipher.decrypt(Buffer.from(stored.slice(PREFIX.length), 'base64'));
      if (typeof value !== 'string') return null;
      this.memory.set(key, value);
      return value;
    } catch {
      this.onError(new Error('secure value could not be decrypted'), 'secure read');
      return null;
    }
  }

  // Resolves { persisted }. Never writes plain text. Encrypts first: an
  // encryption error keeps the value in memory only and reports it.
  async setItem(key, value) {
    if (typeof value !== 'string') throw new Error('Secure value must be a string');
    this.memory.set(key, value);
    if (VERIFIER.test(key) || !this._available()) return { persisted: false };
    let sealed;
    try {
      sealed = PREFIX + Buffer.from(this.cipher.encrypt(value)).toString('base64');
    } catch (err) {
      this.degraded = true;
      this.onError(new Error('secure value could not be encrypted'), 'secure write');
      return { persisted: false };
    }
    await this.kv.setItem(fileKey(key), sealed);
    this.degraded = false;
    return { persisted: true };
  }

  async removeItem(key) {
    this.memory.delete(key);
    if (VERIFIER.test(key)) return;
    await this.kv.removeItem(fileKey(key));
  }

  // The in-memory verifier entries, as a private copy.
  snapshotVerifiers() {
    return [...this.memory].filter(([k]) => VERIFIER.test(k));
  }

  wipeVerifiers() {
    for (const k of [...this.memory.keys()]) if (VERIFIER.test(k)) this.memory.delete(k);
  }

  // Puts a snapshot back exactly as it was.
  restoreVerifiers(entries) {
    this.wipeVerifiers();
    for (const [k, v] of entries || []) this.memory.set(k, v);
  }

  hasVerifiers() {
    return this.snapshotVerifiers().length > 0;
  }
}

module.exports = { SecureStore, fileKey, PREFIX };
