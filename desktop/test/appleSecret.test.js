'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { makeClientSecret, SECONDS } = require('../scripts/apple-client-secret');

test('client secret is a valid ES256 JWT with the claims Apple expects', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const jwt = makeClientSecret({ teamId: 'TEAM123456', servicesId: 'com.example.signin', keyId: 'KEY1234567', privateKeyPem: pem, now: 1000 });
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), {
    iss: 'TEAM123456',
    iat: 1000,
    exp: 1000 + SECONDS,
    aud: 'https://appleid.apple.com',
    sub: 'com.example.signin',
  });
  assert.ok(SECONDS <= 15777000);
  assert.equal(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), true);
});
