import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  filterNonCJK,
  mainHandle,
  postHandle,
  contentHandle,
} from '../lib/textProcessor.mjs';

// Silence the debug LOG output so test runner stays readable.
const origLog = console.log;
console.log = () => {};
process.on('exit', () => { console.log = origLog; });

test('filterNonCJK keeps Chinese, ASCII, line feed, ellipsis', () => {
  const input = '中文abc123…\n\t你好';
  // tab (0x09) is outside the allow-list and should be removed.
  assert.equal(filterNonCJK(input), '中文abc123…\n你好');
});

test('filterNonCJK strips control bytes and emoji outside ranges', () => {
  const input = 'A\x00B\u{1F600}C';
  assert.equal(filterNonCJK(input), 'ABC');
});

test('mainHandle mode 5 (cheerio) strips HTML tags', () => {
  const html = '<p>hello <b>world</b></p><script>bad()</script>';
  const out = mainHandle(html, '5');
  assert.ok(out.includes('hello'));
  assert.ok(out.includes('world'));
  assert.ok(!out.includes('bad()'));
  assert.ok(!out.includes('<'));
});

test('mainHandle decodes HTML entities', () => {
  const html = '<p>a&amp;b &#x4E2D;</p>';
  const out = mainHandle(html, '5');
  assert.ok(out.includes('a&b'));
  assert.ok(out.includes('中'));
});

test('mainHandle mode 2 keeps inner text of paired tags', () => {
  const html = '<span>keep me</span>';
  const out = mainHandle(html, '2');
  assert.ok(out.includes('keep me'));
});

test('mainHandle skipTrim returns buf unchanged through handle loop', () => {
  const buf = '<p>x</p>';
  // skipTrim: short-circuits inside handle => prev becomes curr immediately.
  const out = mainHandle(buf, '5', true);
  assert.equal(out, buf);
});

test('postHandle number chapterType wraps numeric lines', () => {
  const buf = '1\n世界\n2\n你好\n';
  const out = postHandle(buf, 'number', '0', '0');
  assert.ok(out.includes('第1章'));
  assert.ok(out.includes('第2章'));
});

test('postHandle 、 chapterType produces "第N章 NAME"', () => {
  const buf = '1、序章\n內文\n2、第二回\n更多內文\n';
  const out = postHandle(buf, '、', '0', '0');
  assert.ok(out.includes('第1章 序章'));
  assert.ok(out.includes('第2章 第二回'));
});

test('postHandle default text chapterType matches "N NAME" lines', () => {
  const buf = '1 序章\n內文\n';
  const out = postHandle(buf, 'text', '0', '0');
  assert.ok(out.includes('第1章 序章'));
});

test('postHandle autoPagination inserts pagination markers', () => {
  const buf = '第1章\n' + 'A'.repeat(50) + '\n' + 'B'.repeat(50) + '\n';
  const out = postHandle(buf, 'text', '0', '20');
  assert.ok(out.includes('第1話'));
  assert.ok(out.includes('第2話'));
});

test('contentHandle end-to-end on simple HTML', () => {
  const html = '<div><p>第一章 序</p><p>故事開始。故事繼續。</p></div>';
  const out = contentHandle(html, { treatAsPureText: '5', chapterType: 'text' });
  assert.ok(out.includes('第一章'));
  assert.ok(out.includes('故事開始'));
});
