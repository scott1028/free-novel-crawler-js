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

test('TimotxtNovelGrabber article regex matches the updated directory layout', async () => {
  const { TimotxtNovelGrabber } = await import('../timotxtDownloader.mjs');
  const inst = new TimotxtNovelGrabber();
  const html = `
    <nav class="breadcrumb" aria-label="breadcrumbs">
      <ul>
        <li class="is-active">
          <a href="#" aria-current="page">高武：登錄未來一萬年</a>
        </li>
      </ul>
    </nav>
    <div class="chaplist">
      <div class="header has-btn">
        <h3><span>高武：登錄未來一萬年全部章节</span></h3>
        <button class="button is-small is-danger is-outlined reverse">
          <span>正序</span>
        </button>
      </div>
      <ul class="flex one two-700 three-900 all">
        <li><a rel="nofollow" href="/2105128652/1.html">上架感言加承諾書</a></li>
        <li><a rel="nofollow" href="/2105128652/2.html">001.噩夢</a></li>
      </ul>
    </div>
    <footer class="py-5 footer"></footer>
  `;

  const titleMatch = inst.getTitleReg().exec(html);
  assert.equal(titleMatch?.groups?.title, '高武：登錄未來一萬年');

  const articleMatch = inst.getArticleAreaReg().exec(html);
  assert.ok(articleMatch, 'expected updated timotxt article area to match');
  const article = articleMatch.groups.article;
  assert.match(article, /2105128652\/1\.html/);
  assert.match(article, /2105128652\/2\.html/);

  const urls = [...article.matchAll(inst.getChapterUrlsReg())].map((match) => match.groups.url);
  assert.deepEqual(urls, ['/2105128652/1.html', '/2105128652/2.html']);
});
