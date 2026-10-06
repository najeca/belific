'use strict';
// Encrypted store for the Supabase session (decision 012). The encryption is
// injected (Electron safeStorage in main, a fake in tests): { isAvailable(),
// encrypt(string) -> Buffer, decrypt(Buffer) -> string }.
//
// Values are kept in memory for this run and persisted, encrypted, through
// the file store. If encryption is unavailable nothing is ever written: the
// session lives in memory only, so sign in works for this run and the user
// signs in again next launch. A tampered or undecryptable file reads as
// "no value", never as plain text.
const crypto = require('node:crypto');

const PREFIX = 'v1:';

function fileKey(key) {
  return 'secure.' + crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 40);
}

class SecureStore {
  constructor(kv, cipher, onError = () => {}) {
    this.kv = kv;
    this.cipher = cipher;
    this.onError = onError;
    this.memory = new Map();
  }

  // True when values survive a restart.
  get persistent() {
    try {
      return this.cipher.isAvailable() === true;
    } catch {
      return false;
    }
  }

  async getItem(key) {
    if (this.memory.has(key)) return this.memory.get(key);
    if (!this.persistent) return null;
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

  // Resolves { persisted }. Never writes plain text.
  async setItem(key, value) {
    if (typeof value !== 'string') throw new Error('Secure value must be a string');
    this.memory.set(key, value);
    if (!this.persistent) return { persisted: false };
    const sealed = PREFIX + Buffer.from(this.cipher.encrypt(value)).toString('base64');
    await this.kv.setItem(fileKey(key), sealed);
    return { persisted: true };
  }

  async removeItem(key) {
    this.memory.delete(key);
    await this.kv.removeItem(fileKey(key));
  }
}

module.exports = { SecureStore, fileKey, PREFIX };
