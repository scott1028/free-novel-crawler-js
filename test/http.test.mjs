import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import iconv from 'iconv-lite';

import { getContent, __internal } from '../lib/http.mjs';

console.log = () => {};

function makeResponse(body, { headers = {}, ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: {
      getSetCookie: () => headers['set-cookie'] ?? [],
    },
    arrayBuffer: async () => {
      const buf = body instanceof Buffer ? body : Buffer.from(body);
      return new Uint8Array(buf).buffer;
    },
  };
}

test('getContent returns Buffer when encoding is null', async () => {
  const fetchImpl = async () => makeResponse(Buffer.from([1, 2, 3, 4]));
  const out = await getContent('https://example.com/a', { encoding: null, fetchImpl });
  assert.ok(Buffer.isBuffer(out));
  assert.deepEqual([...out], [1, 2, 3, 4]);
});

test('getContent decodes gbk and resolves HTML entities', async () => {
  const gbk = iconv.encode('你好&amp;世界', 'gbk');
  const fetchImpl = async () => makeResponse(gbk);
  const out = await getContent('https://example.com/b', { encoding: 'gbk', fetchImpl });
  assert.equal(out, '你好&世界');
});

test('getContent retries then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 3) throw new Error('boom');
    return makeResponse(Buffer.from('ok'));
  };
  // sleepMs/timeoutMs kept tight so the test finishes fast.
  const out = await getContent('https://example.com/c', {
    encoding: null,
    fetchImpl,
    maxTries: 5,
    sleepMs: 0,
  });
  assert.equal(out.toString(), 'ok');
  assert.equal(calls, 3);
});

test('getContent gives up and writes ERROR after max retries', async () => {
  const fetchImpl = async () => { throw new Error('always-fail'); };
  const dir = mkdtempSync(join(tmpdir(), 'http-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const out = await getContent('https://example.com/d', {
      encoding: 'utf-8',
      fetchImpl,
      maxTries: 1,
      sleepMs: 0,
    });
    assert.equal(out, '');
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getContent accumulates cookies per host', async () => {
  __internal.COOKIE_JAR.clear();
  let lastHeaders;
  const fetchImpl = async (_url, init) => {
    lastHeaders = init.headers;
    return makeResponse(Buffer.from('ok'), {
      headers: { 'set-cookie': ['sess=abc; Path=/'] },
    });
  };
  await getContent('https://cookies.test/x', { encoding: null, fetchImpl, sleepMs: 0 });
  await getContent('https://cookies.test/y', { encoding: null, fetchImpl, sleepMs: 0 });
  assert.equal(lastHeaders.Cookie, 'sess=abc');
});
