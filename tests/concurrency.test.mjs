import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pLimit, parallelHandle } from '../lib/concurrency.mjs';

test('pLimit caps concurrent in-flight work', async () => {
  const limit = pLimit(2);
  let active = 0;
  let peak = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const task = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await sleep(10);
    active -= 1;
    return active;
  };
  await Promise.all(Array.from({ length: 6 }, () => limit(task)));
  assert.ok(peak <= 2, `peak=${peak}`);
});

test('parallelHandle preserves input order in results', async () => {
  const fn = async (n) => {
    await new Promise((r) => setTimeout(r, (5 - n) * 5));
    return n * 2;
  };
  const out = await parallelHandle(fn, [1, 2, 3, 4, 5], 3);
  assert.deepEqual(out, [2, 4, 6, 8, 10]);
});

test('parallelHandle times out a stuck task when timeoutMs is set', async () => {
  const fn = (n) => new Promise((resolve) => {
    if (n === 'slow') return; // never resolves
    setTimeout(() => resolve(n), 5);
  });
  await assert.rejects(
    () => parallelHandle(fn, ['fast', 'slow'], 2, 30),
    /timeout/
  );
});

test('parallelHandle passes _delayMs as 2nd arg when delayFn is set', async () => {
  let receivedOpts = null;
  const fn = (url, opts) => { receivedOpts = opts; return 'ok'; };
  await parallelHandle(fn, ['a'], 1, null, () => 4500);
  assert.deepEqual(receivedOpts, { _delayMs: 4500 });
});

test('parallelHandle gives each item its own _delayMs (no closure sharing)', async () => {
  const received = [];
  const fn = (url, opts) => { received.push({ url, ...opts }); return 'ok'; };
  await parallelHandle(fn, ['a', 'b'], 1, null, (i) => i * 1000);
  assert.deepEqual(received[0], { url: 'a', _delayMs: 0 });
  assert.deepEqual(received[1], { url: 'b', _delayMs: 1000 });
});

test('parallelHandle without delayFn does not pass options to worker', async () => {
  let receivedOpts = null;
  const fn = (url, opts) => { receivedOpts = opts; return 'ok'; };
  await parallelHandle(fn, ['a'], 1);
  assert.equal(receivedOpts, undefined);
});

test('parallelHandle with timeout passes _delayMs correctly', async () => {
  let receivedOpts = null;
  const fn = (url, opts) => new Promise((r) => setTimeout(() => r({ url, ...opts }), 5));
  const result = await parallelHandle(fn, ['a'], 1, 30000, () => 7200);
  assert.deepEqual(result[0], { url: 'a', _delayMs: 7200 });
});
