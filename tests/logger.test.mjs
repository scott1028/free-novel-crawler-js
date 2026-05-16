import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LOG, ERROR, LOG_TIME, LOG_TIME_END, __internal } from '../lib/logger.mjs';

function captureConsole(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try { fn(); } finally { console.log = orig; }
  return logs;
}

test('LOG joins args with ", "', () => {
  const logs = captureConsole(() => LOG('a', 1, { b: 2 }));
  assert.equal(logs.length, 1);
  assert.equal(logs[0], 'a, 1, [object Object]');
});

test('LOG_TIME / LOG_TIME_END print key and clear map', () => {
  __internal.LOG_TIME_MAP.clear();
  const logs = captureConsole(() => {
    LOG_TIME('k1', 'start');
    LOG_TIME_END('k1', 'end');
  });
  assert.ok(logs[0].includes('k1'));
  assert.ok(logs[1].includes('#sec:'));
  assert.equal(__internal.LOG_TIME_MAP.has('k1'), false);
});

test('LOG_TIME_END without LOG_TIME triggers ERROR', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logger-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    captureConsole(() => LOG_TIME_END('never-started'));
    assert.ok(existsSync('error.txt'));
    const content = readFileSync('error.txt', 'utf-8');
    assert.ok(content.includes('No LOG_TIME before LOG_TIME_END'));
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ERROR writes to error.txt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logger-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    captureConsole(() => ERROR('boom', 'detail'));
    const content = readFileSync('error.txt', 'utf-8');
    assert.ok(content.includes('boom detail'));
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
