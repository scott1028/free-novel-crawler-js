import { writeFileSync, appendFileSync } from 'node:fs';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { LOG, LOG_TIME, LOG_TIME_END } from './logger.mjs';
import { getContent } from './http.mjs';
import { parallelHandle } from './concurrency.mjs';
import { contentHandle } from './textProcessor.mjs';

const HOST_PREFIX_REGEX = /^(?<host>https?:\/\/[^/]+)/;

export class NovelGrabber {
  constructor({ TXTENCODE = 'utf-8', tip = 'ex: https://czbooks.net/n/uh8aj' } = {}) {
    this.TXTENCODE = TXTENCODE;
    this.tip = tip;
  }

  // --- abstract; subclasses must override ---
  getTitleReg() { throw new Error('Not implemented: getTitleReg'); }
  getArticleAreaReg() { throw new Error('Not implemented: getArticleAreaReg'); }
  getChapterUrlsReg() { throw new Error('Not implemented: getChapterUrlsReg'); }
  getNovelContentReg() { throw new Error('Not implemented: getNovelContentReg'); }
  getBaseNovelLinkUrlPrefix(url) {
    if (url) {
      const m = HOST_PREFIX_REGEX.exec(url);
      if (m) return m.groups.host;
    }
    throw new Error('Not implemented: getBaseNovelLinkUrlPrefix');
  }
  // Optional: subclasses may override to enable next-page chaining.
  getNovelContentNextPageUrlReg() { return null; }

  async _prompt() {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      const url = (await rl.question('target url?')).trim();
      const startStr = await rl.question(
        'Get From [n:]? ( To skip when you type empty string, `-5 -> [-5:]` ) '
      );
      const retriveStart = startStr.length === 0 ? 0 : parseInt(startStr, 10);
      return { url, retriveStart };
    } finally {
      rl.close();
    }
  }

  async run(options = {}) {
    const {
      workerNum = 20,
      sleepMs = 1,
      maxTries = 10,
      skipTrim = false,
      saveRawBuf = false,
      // test hook: pre-supplied prompts to bypass readline
      promptedUrl = null,
      promptedStart = null,
      // test hook: where to drop output
      outputDir = '.',
    } = options;

    LOG(this.tip);

    let url;
    let retriveStart;
    if (promptedUrl != null) {
      url = promptedUrl;
      retriveStart = promptedStart ?? 0;
    } else {
      ({ url, retriveStart } = await this._prompt());
    }

    const fetchOpts = { encoding: this.TXTENCODE, maxTries, sleepMs };
    let indexBuf = await getContent(url, fetchOpts);

    const titleReg = this.getTitleReg();
    const titleMatch = titleReg.exec(indexBuf);
    if (!titleMatch) throw new Error('Title not found');
    const title = titleMatch.groups.title;

    const articleReg = this.getArticleAreaReg();
    const articleMatch = articleReg.exec(indexBuf);
    if (!articleMatch) throw new Error('Article area not found');
    const article = articleMatch.groups.article;

    const chapterUrlReg = this.getChapterUrlsReg();
    const baseUrl = this.getBaseNovelLinkUrlPrefix(url);
    let urlPool = [...article.matchAll(chapterUrlReg)].map(
      (m) => `${baseUrl}${m.groups.url}`
    );
    if (retriveStart) urlPool = urlPool.slice(retriveStart);

    LOG_TIME('parallelHandle(getContent, url_pool, worker_num)');
    const bufPool = await parallelHandle(
      (u) => getContent(u, fetchOpts),
      urlPool,
      workerNum
    );
    LOG_TIME_END('parallelHandle(getContent, url_pool, worker_num)');

    const fileName = `${outputDir}/done-${title}-${Math.floor(Date.now() / 1000)}.txt`;

    if (saveRawBuf) {
      const rawFile = `${fileName}.raw`;
      writeFileSync(rawFile, '');
      for (const b of bufPool) {
        appendFileSync(rawFile, typeof b === 'string' ? b : String(b));
        appendFileSync(rawFile, '\r\n\r\n');
      }
    }

    let idx = 1;
    let outFileInit = false;

    for (let j = 0; j < bufPool.length; j += 1) {
      let buf = bufPool[j];
      // getContent already decoded when encoding is set; leave as-is.
      const contentReg = this.getNovelContentReg();
      const m = contentReg.exec(buf);
      if (m) {
        const content = contentHandle(m.groups.content, { skipTrim });
        if (!outFileInit) { writeFileSync(fileName, ''); outFileInit = true; }
        appendFileSync(fileName, `\r\n第${idx}回\r\n`);
        appendFileSync(fileName, content);
        idx += 1;
      }
      const nextReg = this.getNovelContentNextPageUrlReg();
      if (nextReg) {
        const np = nextReg.exec(buf);
        if (np && np.groups && np.groups.url) {
          const nextBuf = (await parallelHandle(
            (u) => getContent(u, fetchOpts),
            [np.groups.url],
            1
          ))[0];
          bufPool.splice(j + 1, 0, nextBuf);
        }
      }
    }

    if (!outFileInit) writeFileSync(fileName, '');
    return { fileName, title, chapters: idx - 1 };
  }
}
