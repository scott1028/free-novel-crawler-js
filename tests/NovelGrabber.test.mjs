import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

import { NovelGrabber } from '../lib/NovelGrabber.mjs';
import { IxdzsNovelGrabber } from '../ixdzsDownloader.mjs';

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
  return async (url, init = {}) => {
    const method = String(init.method ?? 'GET').toUpperCase();
    const body = responses.get(`${method} ${url}`) ?? responses.get(url);
    if (body === undefined) throw new Error(`no fixture for ${method} ${url}`);
    return {
      ok: true,
      status: 200,
      headers: { getSetCookie: () => [] },
      __decoded: body,
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
        delayMs: 0,
        randomDelayMs: 0,
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
    ['https://czbooks.net/n/uh8aj/c3', loadFixture('cz-chapter-3.html')],
    ['https://czbooks.net/n/uh8aj/c4', loadFixture('cz-chapter-4.html')],
    ['https://czbooks.net/n/uh8aj/c5', loadFixture('cz-chapter-5.html')],
  ]);

  try {
    const grabber = new CzNovelGrabber({ TXTENCODE: 'utf-8' });
    const result = await grabber.run({
      workerNum: 2,
      sleepMs: 0,
      maxTries: 1,
      delayMs: 0,
      randomDelayMs: 0,
      promptedUrl: 'https://czbooks.net/n/uh8aj',
      promptedStart: 0,
      outputDir: dir,
      debugDumpDir: dir,
      fetchImpl: createFixtureFetch(responses),
    });

    assert.equal(result.title, '測試小說');
    assert.equal(result.chapters, 5);

    const [file] = readdirSync(dir).filter((f) => f.startsWith('done-'));
    assert.ok(file, 'expected done- file');
    const content = readFileSync(join(dir, file), 'utf-8');
    assert.ok(content.includes('第1回'));
    assert.ok(content.includes('第5回'));
    assert.ok(content.includes('故事就此展開'));
    assert.ok(content.includes('故事暫告一段落'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('NovelGrabber.run() passes waitUntil to index and chapter fetches', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'grabber-wait-'));
  const responses = new Map([
    ['https://czbooks.net/n/uh8aj', loadFixture('cz-index.html')],
    ['https://czbooks.net/n/uh8aj/c1', loadFixture('cz-chapter-1.html')],
  ]);
  const waitUntilByUrl = new Map();
  const fetchImpl = async (url, init = {}) => {
    waitUntilByUrl.set(url, init.__waitUntil);
    return createFixtureFetch(responses)(url, init);
  };

  try {
    const grabber = new CzNovelGrabber({ TXTENCODE: 'utf-8' });
    await grabber.run({
      workerNum: 1,
      sleepMs: 0,
      maxTries: 1,
      waitUntil: 'commit',
      delayMs: 0,
      randomDelayMs: 0,
      promptedUrl: 'https://czbooks.net/n/uh8aj',
      promptedStart: 1,
      promptedStop: 1,
      outputDir: dir,
      debugDumpDir: dir,
      fetchImpl,
    });

    assert.equal(waitUntilByUrl.get('https://czbooks.net/n/uh8aj'), 'commit');
    assert.equal(waitUntilByUrl.get('https://czbooks.net/n/uh8aj/c1'), 'commit');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('IxdzsNovelGrabber.run() uses the novel catalog endpoint and parses chapters', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ixdzs-grabber-'));
  const responses = new Map([
    ['https://ixdzs.tw/read/170541/', loadFixture('ixdzs-index.html')],
    ['https://ixdzs.tw/read/170541', loadFixture('ixdzs-index.html')],
    ['GET https://ixdzs.tw/novel/html/?bid=170541', ''],
    ['POST https://ixdzs.tw/novel/html/', loadFixture('ixdzs-catalog.html')],
    ['https://ixdzs.tw/read/170541/p1.html', loadFixture('ixdzs-chapter-1.html')],
    ['https://ixdzs.tw/read/170541/p2.html', loadFixture('ixdzs-chapter-2.html')],
  ]);

  try {
    const grabber = new IxdzsNovelGrabber({ TXTENCODE: 'utf-8' });
    const result = await grabber.run({
      workerNum: 1,
      sleepMs: 0,
      maxTries: 1,
      delayMs: 0,
      randomDelayMs: 0,
      promptedUrl: 'https://ixdzs.tw/read/170541/',
      promptedStart: 0,
      outputDir: dir,
      debugDumpDir: dir,
      fetchImpl: createFixtureFetch(responses),
    });

    assert.equal(result.title, '都市仙王');
    assert.equal(result.chapters, 2);

    const [file] = readdirSync(dir).filter((f) => f.startsWith('done-'));
    assert.ok(file, 'expected done- file');
    const content = readFileSync(join(dir, file), 'utf-8');
    assert.ok(content.includes('第1回'));
    assert.ok(content.includes('第2回'));
    assert.ok(content.includes('第一章內容'));
    assert.ok(content.includes('第二章內容'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('NovelGrabber._prompt() asks crawler runtime options and defaults blank values', async (t) => {
  const prompts = [];
  let closed = false;
  const answers = [
    'https://czbooks.net/n/uh8aj',
    '',
    '',
    '',
    '',
    '',
  ];

  t.mock.method(readline, 'createInterface', () => ({
    question: async (prompt) => {
      prompts.push(prompt);
      return answers.shift();
    },
    close: () => {
      closed = true;
    },
  }));

  const grabber = new CzNovelGrabber({ TXTENCODE: 'utf-8' });
  const result = await grabber._prompt({
    defaultWorkerNum: 1,
    defaultDelayMs: 3000,
    defaultRandomDelayMs: 3000,
  });

  assert.deepEqual(prompts, [
    'target url? ',
    'Start pageNo from [n:]? (empty=1, default=1, ex: -3 -> [..., n-2, n-1, n]) ',
    'End pageNo to [:m]? (empty=no limit, default=null, ex: -2 -> [...skipped, m-2, m-1, m]) ',
    'parallel? (default: 1) ',
    'delayMs? (default: 3000) ',
    'randomDelayMs? (default: 3000) ',
  ]);
  assert.deepEqual(result, {
    url: 'https://czbooks.net/n/uh8aj',
    retriveStart: 1,
    retriveStop: null,
    workerNum: 1,
    delayMs: 3000,
    randomDelayMs: 3000,
  });
  assert.equal(closed, true);
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

const SLICE_FIXTURES = new Map([
  ['https://czbooks.net/n/uh8aj', loadFixture('cz-index.html')],
  ['https://czbooks.net/n/uh8aj/c1', loadFixture('cz-chapter-1.html')],
  ['https://czbooks.net/n/uh8aj/c2', loadFixture('cz-chapter-2.html')],
  ['https://czbooks.net/n/uh8aj/c3', loadFixture('cz-chapter-3.html')],
  ['https://czbooks.net/n/uh8aj/c4', loadFixture('cz-chapter-4.html')],
  ['https://czbooks.net/n/uh8aj/c5', loadFixture('cz-chapter-5.html')],
]);

async function assertSlice({ retriveStart, retriveStop, expectedPresent = [], expectedAbsent = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'novelgrabber-slice-'));
  try {
    // Use same base URL prefix as parent so protocol-relative hrefs concat correctly:
    // https: + //czbooks.net/n/uh8aj/c1 → https://czbooks.net/n/uh8aj/c1
    class SliceGrabber extends CzNovelGrabber {
      getBaseNovelLinkUrlPrefix() { return 'https:'; }
    }
    const grabber = new SliceGrabber({ TXTENCODE: 'utf-8' });
    await grabber.run({
      url: 'https://czbooks.net/n/uh8aj',
      fetchImpl: createFixtureFetch(SLICE_FIXTURES),
      retriveStart,
      retriveStop,
      outputDir: dir,
      workerNum: 1,
      delayMs: 0,
      randomDelayMs: 0,
    });
    const [file] = readdirSync(dir).filter(f => f.startsWith('done-'));
    const content = readFileSync(join(dir, file), 'utf-8');
    for (const kw of expectedPresent) {
      assert.ok(content.includes(kw), `expected "${kw}" in output`);
    }
    for (const kw of expectedAbsent) {
      assert.ok(!content.includes(kw), `expected "${kw}" not in output`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('NovelGrabber slicing: all chapters (start=1, stop=null)', async () => {
  await assertSlice({
    retriveStart: 1,
    retriveStop: null,
    expectedPresent: ['第一章', '第五章'],
  });
});

test('NovelGrabber slicing: skip first chapter (start=2, stop=null)', async () => {
  await assertSlice({
    retriveStart: 2,
    retriveStop: null,
    expectedPresent: ['第二章', '第五章'],
    expectedAbsent: ['第一章'],
  });
});

test('NovelGrabber slicing: only first chapter (start=1, stop=1)', async () => {
  await assertSlice({
    retriveStart: 1,
    retriveStop: 1,
    expectedPresent: ['第一章'],
    expectedAbsent: ['第二章'],
  });
});

test('NovelGrabber slicing: first two chapters (start=1, stop=2)', async () => {
  await assertSlice({
    retriveStart: 1,
    retriveStop: 2,
    expectedPresent: ['第一章', '第二章'],
    expectedAbsent: ['第三章'],
  });
});

test('NovelGrabber slicing: last chapter only (start=-1, stop=null)', async () => {
  await assertSlice({
    retriveStart: -1,
    retriveStop: null,
    expectedPresent: ['第五章'],
    expectedAbsent: ['第四章'],
  });
});

test('NovelGrabber slicing: except last chapter (start=1, stop=-1)', async () => {
  await assertSlice({
    retriveStart: 1,
    retriveStop: -1,
    expectedPresent: ['第一章', '第四章'],
    expectedAbsent: ['第五章'],
  });
});

test('NovelGrabber slicing: range with negative indices (start=-2, stop=-1)', async () => {
  await assertSlice({
    retriveStart: -2,
    retriveStop: -1,
    expectedPresent: ['第四章'],
    expectedAbsent: ['第三章', '第五章'],
  });
});

test('NovelGrabber slicing: start=3, stop=-1', async () => {
  await assertSlice({
    retriveStart: 3,
    retriveStop: -1,
    expectedPresent: ['第三章', '第四章'],
    expectedAbsent: ['第二章', '第五章'],
  });
});

test('NovelGrabber throws when subclass missing implementation', () => {
  class Bad extends NovelGrabber {}
  const bad = new Bad();
  assert.throws(() => bad.getTitleReg(), /Not implemented/);
});
