'use strict';
// Before the first ever sign in on an install, force one backup named
// "pre-signin" (decision 012), so a bad first merge is recoverable. The flag
// is set only after the backup succeeds; if the backup fails the sign in is
// refused (the caller gets the error) and the next attempt tries again.
const FLAG_KEY = 'belific_first_signin_backup';

async function ensureFirstSigninBackup({ kv, backup, now = new Date() }) {
  if ((await kv.getItem(FLAG_KEY)) !== null) return { took: false };
  const target = await backup('pre-signin', now);
  await kv.setItem(FLAG_KEY, now.toISOString());
  return { took: true, target };
}

module.exports = { ensureFirstSigninBackup, FLAG_KEY };
