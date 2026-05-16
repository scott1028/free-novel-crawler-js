import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NovelGrabber } from '../lib/NovelGrabber.mjs';

const modules = [
  { file: '../23qbDownloader.mjs', cls: 'X23QBNovelGrabber' },
  { file: '../69shuDownloader.mjs', cls: 'SixNineshuNovelGrabber' },
  { file: '../8bookDownloader.mjs', cls: 'EightBookNovelGrabber' },
  { file: '../8wenkuDownloader.mjs', cls: 'EightWenkuNovelGrabber' },
  { file: '../8wenkuNovelDownloader.mjs', cls: 'EightWenkuNovelGrabber' },
  { file: '../biqugeDownloader.mjs', cls: 'BiqugeNovelGrabber' },
  { file: '../czDownloader.mjs', cls: 'CzNovelGrabber' },
  { file: '../ixdzsDownloader.mjs', cls: 'IxdzsNovelGrabber' },
  { file: '../novel543Downloader.mjs', cls: 'Novel543NovelGrabber' },
  { file: '../quanben5Downloader.mjs', cls: 'Quanben5NovelGrabber' },
  { file: '../timotxtDownloader.mjs', cls: 'TimotxtNovelGrabber' },
  { file: '../tsnwbDownloader.mjs', cls: 'TsnwbNovelGrabber' },
  { file: '../wenku8Downloader.mjs', cls: 'Wenku8NovelGrabber' },
];

for (const { file, cls } of modules) {
  test(`${cls} loads and provides all required regexes`, async () => {
    const mod = await import(file);
    const Cls = mod[cls];
    assert.ok(Cls, `expected export ${cls} from ${file}`);
    const inst = new Cls();
    assert.ok(inst instanceof NovelGrabber);

    for (const method of [
      'getTitleReg',
      'getArticleAreaReg',
      'getChapterUrlsReg',
      'getNovelContentReg',
    ]) {
      const reg = inst[method]();
      assert.ok(reg instanceof RegExp, `${cls}.${method}() should return RegExp`);
    }
  });
}
