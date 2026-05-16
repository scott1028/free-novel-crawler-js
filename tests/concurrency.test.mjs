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
