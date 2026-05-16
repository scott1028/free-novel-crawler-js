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

function createFixtureFetch(responses) {
  return async (url) => {
    const body = responses.get(url);
    if (!body) throw new Error(`no fixture for ${url}`);
    return {
      ok: true,
      status: 200,
      headers: { getSetCookie: () => [] },
      arrayBuffer: async () => new Uint8Array(Buffer.from(body, 'utf-8')).buffer,
    };
  };
}

async function assertDebugDump({
  grabber,
  responses,
  expectedMessage,
  expectedFileKeyword,
  expectedHtmlSnippet,
}) {
  const dir = mkdtempSync(join(tmpdir(), 'grabber-debug-'));

  try {
    await assert.rejects(
      grabber.run({
        workerNum: 2,
        sleepMs: 0,
        maxTries: 1,
        promptedUrl: 'https://czbooks.net/n/uh8aj',
        promptedStart: 0,
        outputDir: dir,
        debugDumpDir: dir,
        fetchImpl: createFixtureFetch(responses),
      }),
      (error) => {
        assert.match(error.message, expectedMessage);
        assert.match(error.message, /Debug HTML dumped to/);
        return true;
      }
    );

    const dumpedFiles = readdirSync(dir).filter((file) => file.endsWith('.html'));
    assert.equal(dumpedFiles.length, 1);
    assert.match(dumpedFiles[0], expectedFileKeyword);
    const dumpedHtml = readFileSync(join(dir, dumpedFiles[0]), 'utf-8');
    assert.match(dumpedHtml, expectedHtmlSnippet);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('NovelGrabber.run() pipeline produces a done file with all chapters', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'grabber-'));
  const responses = new Map([
    ['https://czbooks.net/n/uh8aj', loadFixture('cz-index.html')],
    ['https://czbooks.net/n/uh8aj/c1', loadFixture('cz-chapter-1.html')],
    ['https://czbooks.net/n/uh8aj/c2', loadFixture('cz-chapter-2.html')],
  ]);

  try {
    const grabber = new CzNovelGrabber({ TXTENCODE: 'utf-8' });
    const result = await grabber.run({
      workerNum: 2,
      sleepMs: 0,
      maxTries: 1,
      promptedUrl: 'https://czbooks.net/n/uh8aj',
      promptedStart: 0,
      outputDir: dir,
      debugDumpDir: dir,
      fetchImpl: createFixtureFetch(responses),
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

test('NovelGrabber dumps index HTML when title regex misses', async () => {
  class MissingTitleGrabber extends CzNovelGrabber {
    getTitleReg() { return /<span class="missing-title">(?<title>.*?)<\/span>/s; }
  }

  await assertDebugDump({
    grabber: new MissingTitleGrabber({ TXTENCODE: 'utf-8' }),
    responses: new Map([
      ['https://czbooks.net/n/uh8aj', loadFixture('cz-index.html')],
    ]),
    expectedMessage: /Title not found/,
    expectedFileKeyword: /index-title-miss/,
    expectedHtmlSnippet: /測試小說/,
  });
});

test('NovelGrabber dumps index HTML when article regex misses', async () => {
  class MissingArticleGrabber extends CzNovelGrabber {
    getArticleAreaReg() {
      return /<ul.*?id="missing-list".*?>.*?(?<article>.*?)<\/ul>/s;
    }
  }

  await assertDebugDump({
    grabber: new MissingArticleGrabber({ TXTENCODE: 'utf-8' }),
    responses: new Map([
      ['https://czbooks.net/n/uh8aj', loadFixture('cz-index.html')],
    ]),
    expectedMessage: /Article area not found/,
    expectedFileKeyword: /index-article-miss/,
    expectedHtmlSnippet: /chapter-list/,
  });
});

test('NovelGrabber dumps chapter HTML and fails fast when content regex misses', async () => {
  class MissingContentGrabber extends CzNovelGrabber {
    getNovelContentReg() {
      return /<div.*?class.*?=.*?"missing-content".*?>(?<content>.*?)<\/div>/s;
    }
  }

  await assertDebugDump({
    grabber: new MissingContentGrabber({ TXTENCODE: 'utf-8' }),
    responses: new Map([
      ['https://czbooks.net/n/uh8aj', loadFixture('cz-index.html')],
      ['https://czbooks.net/n/uh8aj/c1', loadFixture('cz-chapter-1.html')],
      ['https://czbooks.net/n/uh8aj/c2', loadFixture('cz-chapter-2.html')],
    ]),
    expectedMessage: /Novel content not found/,
    expectedFileKeyword: /chapter-content-miss/,
    expectedHtmlSnippet: /開始/,
  });
});

test('NovelGrabber throws when subclass missing implementation', () => {
  class Bad extends NovelGrabber {}
  const bad = new Bad();
  assert.throws(() => bad.getTitleReg(), /Not implemented/);
});
