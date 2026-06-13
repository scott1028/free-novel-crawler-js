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
  { file: '../hjwzwDownloader.mjs', cls: 'HjwzwNovelGrabber' },
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

test('HjwzwNovelGrabber matches the catalog DOM order and chapter body', async () => {
  const { HjwzwNovelGrabber } = await import('../hjwzwDownloader.mjs');
  const inst = new HjwzwNovelGrabber();
  const html = `
    <table style="width: 960px; text-align: center;">
      <tr>
        <td>
          <h1>大道獨行</h1>
        </td>
      </tr>
    </table>
    <div id="tbchapterlist" style="margin: 0 auto;">
      <table style="width: 960px;">
        <tr>
          <td><a href="/Book/Read/33778,6930990" title=" 第一章 天道殺 大道獨行 霧外江山 更新時間: 2020-06-20 20:41:00">第一章 天道殺</a>
          </td><td><a href="/Book/Read/33778,6930994" title=" 第二章 心是黑的 大道獨行 霧外江山 更新時間: 2020-06-20 20:41:00">第二章 心是黑的</a>
          </td><td><span><a class="chapter-link" href="/Book/Read/33778,8466384" title=" 第一千二百七十章 改天道拯救世界 大道獨行 霧外江山 更新時間: 2014-12-12 23:46:00">第一千二百七十章 改天道拯救世界</a></span>
          </td>
        </tr>
      </table>
    </div>
    <div style="clear: both;"></div>
  `;

  const titleMatch = inst.getTitleReg().exec(html);
  assert.equal(titleMatch?.groups?.title, '大道獨行');

  const articleMatch = inst.getArticleAreaReg().exec(html);
  assert.ok(articleMatch, 'expected hjwzw article area to match');
  const urls = [...articleMatch.groups.article.matchAll(inst.getChapterUrlsReg())]
    .map((match) => match.groups.url);
  assert.deepEqual(urls, [
    '/Book/Read/33778,6930990',
    '/Book/Read/33778,6930994',
    '/Book/Read/33778,8466384',
  ]);
  assert.equal(
    `${inst.getBaseNovelLinkUrlPrefix()}${urls[0]}`,
    'https://tw.hjwzw.com/Book/Read/33778,6930990'
  );

  const chapterHtml = `
    <div class="chapter-content" style="font-size: 18px; line-height: 32px;">
      請記住本站域名: <b>黃金屋</b><p />
      <a href="/Book/33778" title="大道獨行">大道獨行</a>&nbsp;第一章 天道殺<p/>
      龍首山，銀州第一名山，山勢陡峭，青巖片片。<p/>
      這青巖光滑如玉。<p/>
    </div>
    <div class="site-notice">
      請記住本站域名: <b>黃金屋</b><p />
    </div>
    <div id="Pan_Ad2"></div>
  `;

  const contentMatch = inst.getNovelContentReg().exec(chapterHtml);
  assert.ok(contentMatch, 'expected hjwzw chapter content to match');
  assert.match(contentMatch.groups.content, /龍首山，銀州第一名山/);
  assert.ok(!contentMatch.groups.content.includes('請記住本站域名'));

  const updatedChapterHtml = `
    <div style="font-size: 20px; line-height: 30px; word-wrap: break-word;">
      請記住本站域名: <b>黃金屋</b><p>
      <a href="/Book/33778" title="大道獨行">大道獨行</a>&nbsp;第五十四章 金風玉露一相逢</p><p>
      時間一點點的過去，又是一年七月初七來到。<p>
      轉眼到了八月初三。<p>
    </p></div>
    <div style="font-size: 20px; line-height: 30px; word-wrap: break-word;">
      請記住本站域名: <b>黃金屋</b><p>
    </p></div>
    <div style="width: 750px; margin: 0 auto; text-align: center;">
      快捷鍵: 上一章("←"或者"P") 下一章("→"或者"N") 回車鍵:返回書頁
    </div>
  `;

  const updatedContentMatch = inst.getNovelContentReg().exec(updatedChapterHtml);
  assert.ok(updatedContentMatch, 'expected updated hjwzw chapter content to match');
  assert.match(updatedContentMatch.groups.content, /時間一點點的過去/);
  assert.ok(!updatedContentMatch.groups.content.includes('請記住本站域名'));
  assert.ok(!updatedContentMatch.groups.content.includes('快捷鍵'));
});
