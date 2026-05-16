import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NovelGrabber } from '../lib/NovelGrabber.mjs';

console.log = () => {};

const HERE = dirname(fileURLToPath(import.meta.url));

class CzNovelGrabber extends NovelGrabber {
  getTitleReg() { return /<span class="title">(?<title>.*?)<\/span>/s; }
  getArticleAreaReg() {
    return /<ul.*?id="chapter-list".*?>.*?(?<article>.*?)<\/ul>/s;
  }
  getChapterUrlsReg() {
    return /<li><a.*?href.*?="(?<url>.*?)".*?>.*?<\/li>/gm;
  }
  getBaseNovelLinkUrlPrefix() { return 'https:'; }
  getNovelContentReg() {
    return /<div.*?class.*?=.*?"content".*?>(?<content>.*?)<div.*?class.*?=.*?"notice">/s;
  }
}

function loadFixture(name) {
  return readFileSync(join(HERE, 'fixtures', name), 'utf-8');
}

test('NovelGrabber.run() pipeline produces a done file with all chapters', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'grabber-'));
  const responses = new Map([
    ['https://czbooks.net/n/uh8aj', loadFixture('cz-index.html')],
    ['https://czbooks.net/n/uh8aj/c1', loadFixture('cz-chapter-1.html')],
    ['https://czbooks.net/n/uh8aj/c2', loadFixture('cz-chapter-2.html')],
  ]);

  const fetchImpl = async (url) => {
    const body = responses.get(url);
    if (!body) throw new Error(`no fixture for ${url}`);
    return {
      ok: true,
      status: 200,
      headers: { getSetCookie: () => [] },
      arrayBuffer: async () => new Uint8Array(Buffer.from(body, 'utf-8')).buffer,
    };
  };

  try {
    const grabber = new CzNovelGrabber({ TXTENCODE: 'utf-8' });
    const result = await grabber.run({
      workerNum: 2,
      sleepMs: 0,
      maxTries: 1,
      promptedUrl: 'https://czbooks.net/n/uh8aj',
      promptedStart: 0,
      outputDir: dir,
      fetchImpl,
    });

    assert.equal(result.title, '測試小說');
    assert.equal(result.chapters, 2);

    const [file] = readdirSync(dir).filter((f) => f.startsWith('done-'));
    assert.ok(file, 'expected done- file');
    const content = readFileSync(join(dir, file), 'utf-8');
    assert.ok(content.includes('第1回'));
    assert.ok(content.includes('第2回'));
    assert.ok(content.includes('開始'));
    assert.ok(content.includes('進行'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('NovelGrabber throws when subclass missing implementation', () => {
  class Bad extends NovelGrabber {}
  const bad = new Bad();
  assert.throws(() => bad.getTitleReg(), /Not implemented/);
});
