'use strict';
// Generates the Apple "client secret" (a JWT, valid for at most 6 months) for
// Supabase's Apple provider. See docs/APPLE_SIGNIN_SETUP.md section (c).
//
//   node scripts/apple-client-secret.js <TEAM_ID> <SERVICES_ID> <KEY_ID> <path-to-AuthKey.p8>
//
// Prints the JWT to the terminal only. It never writes a file and never sends
// anything anywhere. Keep the .p8 out of the repository.
const crypto = require('node:crypto');
const fs = require('node:fs');

const SECONDS = 15777000; // Apple's maximum: about 6 months

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function makeClientSecret({ teamId, servicesId, keyId, privateKeyPem, now = Math.floor(Date.now() / 1000) }) {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = { iss: teamId, iat: now, exp: now + SECONDS, aud: 'https://appleid.apple.com', sub: servicesId };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.sign('sha256', Buffer.from(data), { key: privateKeyPem, dsaEncoding: 'ieee-p1363' });
  return `${data}.${signature.toString('base64url')}`;
}

module.exports = { makeClientSecret, SECONDS };

if (require.main === module) {
  const [teamId, servicesId, keyId, keyPath] = process.argv.slice(2);
  if (!teamId || !servicesId || !keyId || !keyPath) {
    console.error('Usage: node scripts/apple-client-secret.js <TEAM_ID> <SERVICES_ID> <KEY_ID> <path-to-AuthKey.p8>');
    process.exit(2);
  }
  const jwt = makeClientSecret({ teamId, servicesId, keyId, privateKeyPem: fs.readFileSync(keyPath, 'utf8') });
  console.log(jwt);
  console.error(`Expires ${new Date((Math.floor(Date.now() / 1000) + SECONDS) * 1000).toDateString()}. Set a reminder about 5 months from now.`);
}
