import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runTxtUtils } from '../txtUtils.mjs';

console.log = () => {};

test('runTxtUtils processes *.txt files, skips done- and requirements-', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'txt-'));
  writeFileSync(join(dir, 'chapter.txt'), '<p>第一章 序</p><p>內文。內文。</p>', 'utf-8');
  writeFileSync(join(dir, 'done-skip.txt'), 'should be skipped', 'utf-8');
  writeFileSync(join(dir, 'requirements.txt'), 'should be skipped', 'utf-8');
  writeFileSync(join(dir, 'image.png'), 'not text', 'utf-8');

  await runTxtUtils({
    encoding: 'utf-8',
    concat: 'N',
    mode: '5',
    cwd: dir,
  });

  const files = readdirSync(dir);
  const generated = files.find((f) => f.startsWith('done-chapter-'));
  assert.ok(generated, `expected a done-chapter-* file, got ${files.join(', ')}`);

  const content = readFileSync(join(dir, generated), 'utf-8');
  assert.ok(content.includes('第一章'));
  assert.ok(!content.includes('<p>'));

  // skipped files left untouched
  assert.equal(readFileSync(join(dir, 'done-skip.txt'), 'utf-8'), 'should be skipped');
  assert.equal(readFileSync(join(dir, 'requirements.txt'), 'utf-8'), 'should be skipped');

  rmSync(dir, { recursive: true, force: true });
});

test('runTxtUtils concat mode produces a single done-all-* file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'txt-'));
  writeFileSync(join(dir, 'a-chapter.txt'), '<p>A</p>', 'utf-8');
  writeFileSync(join(dir, 'b-chapter.txt'), '<p>B</p>', 'utf-8');

  await runTxtUtils({
    encoding: 'utf-8',
    concat: 'Y',
    mode: '5',
    cwd: dir,
  });

  const files = readdirSync(dir);
  const concat = files.find((f) => f.startsWith('done-all-'));
  assert.ok(concat, `expected a done-all-* file, got ${files.join(', ')}`);
  const content = readFileSync(join(dir, concat), 'utf-8');
  assert.ok(content.includes('A'));
  assert.ok(content.includes('B'));

  rmSync(dir, { recursive: true, force: true });
});
