'use strict';
// Daily backup of the data folder (decision 011): copy data/ to
// backups/YYYY-MM-DD/, keep the newest `keep` folders. Pure Node.
const fs = require('node:fs');
const path = require('node:path');

const DAY_FOLDER = /^\d{4}-\d{2}-\d{2}$/;

function dayStamp(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Copies the live data files (not temp files) into today's folder,
// replacing any earlier backup from the same day, then prunes.
// An optional label (lowercase letters, digits, dashes) makes a separate
// folder, e.g. 2026-10-06-pre-signin, which pruning never touches.
async function backupNow(dataDir, backupsDir, now = new Date(), keep = 14, label = null) {
  if (label !== null && !/^[a-z0-9-]{1,32}$/.test(label)) throw new Error('Invalid backup label');
  await fs.promises.mkdir(backupsDir, { recursive: true });
  const target = path.join(backupsDir, label ? `${dayStamp(now)}-${label}` : dayStamp(now));
  const staging = `${target}.partial`;
  await fs.promises.rm(staging, { recursive: true, force: true });
  await fs.promises.mkdir(staging, { recursive: true });
  const names = await fs.promises.readdir(dataDir).catch((err) => {
    if (err.code === 'ENOENT') return [];
    throw err;
  });
  for (const name of names) {
    if (!name.endsWith('.kv')) continue;
    await fs.promises.copyFile(path.join(dataDir, name), path.join(staging, name));
  }
  await fs.promises.rm(target, { recursive: true, force: true });
  await fs.promises.rename(staging, target);
  if (!label) await pruneBackups(backupsDir, keep);
  return target;
}

async function pruneBackups(backupsDir, keep = 14) {
  const entries = await fs.promises.readdir(backupsDir, { withFileTypes: true });
  const days = entries
    .filter((e) => e.isDirectory() && DAY_FOLDER.test(e.name))
    .map((e) => e.name)
    .sort();
  const excess = days.slice(0, Math.max(0, days.length - keep));
  for (const name of excess) {
    await fs.promises.rm(path.join(backupsDir, name), { recursive: true, force: true });
  }
  return excess;
}

module.exports = { backupNow, pruneBackups, dayStamp };
