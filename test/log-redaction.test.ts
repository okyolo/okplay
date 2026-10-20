import assert from 'node:assert/strict';
import test from 'node:test';

import { redactLogString } from '../src/main/log.ts';

const REDACTED = '(已脱敏：带签名的地址)';

test('redacts credential-like query parameter names in absolute and relative URLs', () => {
  const sensitive = [
    'https://x.test/k?DrmAuthToken=secret',
    'https://x.test/k?ak=1&DrmAuthToken=secret',
    '/kds/api/v1/keys?DrmAuthToken=secret',
    'https://x.test/v.m3u8?auth_key=secret',
    'https://x.test/v?X-Tos-Signature=secret',
  ];

  for (const value of sensitive) assert.equal(redactLogString(value), REDACTED);
});

test('keeps ordinary URLs unchanged', () => {
  const value = 'https://learn.example.test/courses?page=2';
  assert.equal(redactLogString(value), value);
});
