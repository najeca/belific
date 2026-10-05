'use strict';
// File-backed key/value store for the desktop app (decision 011).
// One file per key, written atomically (temp file then rename), writes
// queued per key so two writes to the same key never interleave.
// Pure Node, no Electron imports, so it can be unit tested.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const KEY_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;
const SUFFIX = '.kv';

function validateKey(key) {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new Error(`Invalid storage key: ${String(key).slice(0, 40)}`);
  }
  return key;
}

class KvStore {
  // onError(err, context) is called for every failed operation. The error
  // is still thrown to the caller: failures are never swallowed.
  constructor(dir, onError = () => {}) {
    this.dir = dir;
    this.onError = onError;
    this.queues = new Map();
    fs.mkdirSync(dir, { recursive: true });
  }

  filePath(key) {
    return path.join(this.dir, validateKey(key) + SUFFIX);
  }

  // Serialise operations per key: each runs after the previous one for
  // the same key has settled (whether it succeeded or failed).
  _enqueue(key, task) {
    const previous = this.queues.get(key) || Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.catch(() => {});
    this.queues.set(key, tail);
    tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key);
    });
    return run;
  }

  async getItem(key) {
    const file = this.filePath(key);
    return this._enqueue(key, async () => {
      try {
        return await fs.promises.readFile(file, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        this.onError(err, `getItem ${key}`);
        throw err;
      }
    });
  }

  async setItem(key, value) {
    const file = this.filePath(key);
    if (typeof value !== 'string') throw new Error(`Value for ${key} must be a string`);
    return this._enqueue(key, async () => {
      const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
      try {
        await fs.promises.writeFile(tmp, value, 'utf8');
        await fs.promises.rename(tmp, file);
      } catch (err) {
        await fs.promises.rm(tmp, { force: true }).catch(() => {});
        this.onError(err, `setItem ${key}`);
        throw err;
      }
    });
  }

  async removeItem(key) {
    const file = this.filePath(key);
    return this._enqueue(key, async () => {
      try {
        await fs.promises.rm(file, { force: true });
      } catch (err) {
        this.onError(err, `removeItem ${key}`);
        throw err;
      }
    });
  }

  async multiRemove(keys) {
    if (!Array.isArray(keys)) throw new Error('multiRemove expects an array of keys');
    keys.forEach(validateKey);
    await Promise.all(keys.map((k) => this.removeItem(k)));
  }

  // Every stored key and value, for the "Export data" menu item.
  async readAll() {
    const names = await fs.promises.readdir(this.dir);
    const out = {};
    for (const name of names) {
      if (!name.endsWith(SUFFIX)) continue;
      const key = name.slice(0, -SUFFIX.length);
      if (!KEY_PATTERN.test(key)) continue;
      out[key] = await this.getItem(key);
    }
    return out;
  }
}

module.exports = { KvStore, validateKey, KEY_PATTERN, SUFFIX };
