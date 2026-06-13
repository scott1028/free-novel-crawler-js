import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { join } from 'node:path';

import { LOG, LOG_TIME, LOG_TIME_END } from './logger.mjs';
import { getContent } from './http.mjs';
import { parallelHandle } from './concurrency.mjs';
import { contentHandle } from './textProcessor.mjs';
import { closeBrowser } from './playwrightFetcher.mjs';

const HOST_PREFIX_REGEX = /^(?<host>https?:\/\/[^/]+)/;
const INVALID_FILE_CHARS_REGEX = /[^a-zA-Z0-9._-]+/g;

function parseNumberOrDefault(value, defaultValue, { integer = false, min = -Infinity } = {}) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return defaultValue;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min) return defaultValue;
  if (integer && !Number.isInteger(parsed)) return defaultValue;
  return parsed;
}

function parseStopIndex(value) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  if (parsed === 0) return null;
  return parsed;
}

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

  async _prompt({ defaultWorkerNum = 1, defaultDelayMs = 3000, defaultRandomDelayMs = 3000 } = {}) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      const url = (await rl.question('target url? ')).trim();
      const startStr = await rl.question(
        'Start pageNo from [n:]? (empty=1, default=1, ex: -3 -> [..., n-2, n-1, n]) '
      );
      const stopStr = await rl.question(
        'End pageNo to [:m]? (empty=no limit, default=null, ex: -2 -> [...skipped, m-2, m-1, m]) '
      );
      const workerStr = await rl.question(`parallel? (default: ${defaultWorkerNum}) `);
      const delayMsStr = await rl.question(`delayMs? (default: ${defaultDelayMs}) `);
      const randomDelayMsStr = await rl.question(`randomDelayMs? (default: ${defaultRandomDelayMs}) `);
      const retriveStart = parseNumberOrDefault(startStr, 1, { integer: true });
      const retriveStop = parseStopIndex(stopStr);
      const workerNum = parseNumberOrDefault(workerStr, defaultWorkerNum, { integer: true, min: 1 });
      const delayMs = parseNumberOrDefault(delayMsStr, defaultDelayMs, { min: 0 });
      const randomDelayMs = parseNumberOrDefault(randomDelayMsStr, defaultRandomDelayMs, { min: 0 });
      return { url, retriveStart, retriveStop, workerNum, delayMs, randomDelayMs };
    } finally {
      rl.close();
    }
  }

  async run(options = {}) {
    const {
      workerNum = 1,
      sleepMs = 1,
      maxTries = 10,
      waitUntil = 'domcontentloaded',
      skipTrim = false,
      saveRawBuf = false,
      baseInterval = 3,
      randomInterval = 3,
      delayMs = baseInterval * 1000,
      randomDelayMs = randomInterval * 1000,
      retriveStart: retriveStartOpt,
      retriveStop: retriveStopOpt,
      // test hook: pre-supplied prompts to bypass readline
      promptedUrl = null,
      promptedStart = null,
      promptedStop = null,
      // test hook: where to drop output
      outputDir = '.',
      debugDumpDir = './.tmp',
      // test hook: inject custom fetcher (mock); default uses playwright via getContent.
      fetchImpl = undefined,
      // when fetchImpl is injected, skip closing the real playwright browser.
      closeBrowserOnExit = fetchImpl === undefined,
    } = options;

    LOG(this.tip);

    let url;
    let retriveStart;
    let retriveStop = null;
    let resolvedWorkerNum = workerNum;
    let resolvedDelayMs = delayMs;
    let resolvedRandomDelayMs = randomDelayMs;
    if (promptedUrl != null) {
      url = promptedUrl;
      retriveStart = promptedStart ?? retriveStartOpt ?? 1;
      retriveStop = promptedStop !== null ? promptedStop : (retriveStopOpt ?? null);
    } else if (retriveStartOpt != null || retriveStopOpt != null) {
      url = options.url;
      retriveStart = retriveStartOpt ?? 1;
      retriveStop = retriveStopOpt ?? null;
    } else {
      ({
        url,
        retriveStart,
        retriveStop,
        workerNum: resolvedWorkerNum,
        delayMs: resolvedDelayMs,
        randomDelayMs: resolvedRandomDelayMs,
      } = await this._prompt({
        defaultWorkerNum: workerNum,
        defaultDelayMs: delayMs,
        defaultRandomDelayMs: randomDelayMs,
      }));
    }

    const fetchOpts = { encoding: this.TXTENCODE, maxTries, sleepMs, waitUntil };
    if (fetchImpl !== undefined) fetchOpts.fetchImpl = fetchImpl;

    try {
      return await this._runInner({
        url,
        retriveStart,
        retriveStop,
        workerNum: resolvedWorkerNum,
        fetchOpts,
        skipTrim,
        saveRawBuf,
        outputDir,
        debugDumpDir,
        delayMs: resolvedDelayMs,
        randomDelayMs: resolvedRandomDelayMs,
      });
    } finally {
      if (closeBrowserOnExit) await closeBrowser();
    }
  }

  _sanitizeFilePart(value, fallback = 'page') {
    if (typeof value !== 'string' || value.length === 0) return fallback;
    const sanitized = value
      .replace(INVALID_FILE_CHARS_REGEX, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return sanitized || fallback;
  }

  _buildDebugDumpFileName({ stage, url }) {
    let host = 'unknown-host';
    let slug = 'page';

    try {
      const parsed = new URL(url);
      host = this._sanitizeFilePart(parsed.host, 'unknown-host');
      slug = this._sanitizeFilePart(
        `${parsed.pathname}${parsed.search}${parsed.hash}`,
        'page'
      );
    } catch {
      slug = this._sanitizeFilePart(url, 'page');
    }

    return `debug-${stage}-${host}-${slug}-${Date.now()}.html`;
  }

  _dumpDebugHtml({ stage, url, html, debugDumpDir }) {
    mkdirSync(debugDumpDir, { recursive: true });
    const filePath = join(
      debugDumpDir,
      this._buildDebugDumpFileName({ stage, url })
    );
    writeFileSync(filePath, typeof html === 'string' ? html : String(html), 'utf-8');
    return filePath;
  }

  _throwWithDebugDump({ stage, url, html, debugDumpDir, message, cause }) {
    const dumpPath = this._dumpDebugHtml({ stage, url, html, debugDumpDir });
    const error = new Error(`${message}. Debug HTML dumped to ${dumpPath}`);
    if (cause !== undefined) error.cause = cause;
    throw error;
  }

  async _runInner({
    url,
    retriveStart,
    retriveStop,
    workerNum,
    fetchOpts,
    skipTrim,
    saveRawBuf,
    outputDir,
    debugDumpDir,
    delayMs,
    randomDelayMs,
  }) {
    let indexBuf = await getContent(url, fetchOpts);

    const titleReg = this.getTitleReg();
    const titleMatch = titleReg.exec(indexBuf);
    if (!titleMatch) {
      this._throwWithDebugDump({
        stage: 'index-title-miss',
        url,
        html: indexBuf,
        debugDumpDir,
        message: `Title not found for ${url}`,
      });
    }
    const title = titleMatch.groups.title;

    const articleReg = this.getArticleAreaReg();
    const articleMatch = articleReg.exec(indexBuf);
    if (!articleMatch) {
      this._throwWithDebugDump({
        stage: 'index-article-miss',
        url,
        html: indexBuf,
        debugDumpDir,
        message: `Article area not found for ${url}`,
      });
    }
    const article = articleMatch.groups.article;

    const chapterUrlReg = this.getChapterUrlsReg();
    const baseUrl = this.getBaseNovelLinkUrlPrefix(url);
    let urlPool = [...article.matchAll(chapterUrlReg)].map(
      (m) => `${baseUrl}${m.groups.url}`
    );
    // Convert pageNo to slice indices on the original full chapter list.
    // start: 1-based inclusive pageNo -> 0-based start index.
    // end: inclusive pageNo -> exclusive slice end index.
    const totalPages = urlPool.length;
    const startIndex = retriveStart > 0 ? retriveStart - 1 : retriveStart;
    let endExclusive = null;
    if (retriveStop !== null) {
      endExclusive = retriveStop > 0 ? retriveStop : totalPages + retriveStop;
    }
    urlPool = endExclusive === null
      ? urlPool.slice(startIndex)
      : urlPool.slice(startIndex, endExclusive);

    LOG_TIME('parallelHandle(getContent, url_pool, worker_num)');
    const delayFn = () => delayMs + Math.floor(Math.random() * randomDelayMs);
    const bufPool = await parallelHandle(
      (u, opts) => getContent(u, { ...fetchOpts, ...opts }),
      urlPool,
      workerNum,
      null,
      delayFn
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
      const chapterUrl = urlPool[j] ?? `${url}#chapter-${j + 1}`;
      try {
        // getContent already decoded when encoding is set; leave as-is.
        const contentReg = this.getNovelContentReg();
        const m = contentReg.exec(buf);
        if (!m) {
          this._throwWithDebugDump({
            stage: 'chapter-content-miss',
            url: chapterUrl,
            html: buf,
            debugDumpDir,
            message: `Novel content not found for ${chapterUrl}`,
          });
        }

        const content = contentHandle(m.groups.content, { skipTrim });
        if (!outFileInit) { writeFileSync(fileName, ''); outFileInit = true; }
        appendFileSync(fileName, `\r\n第${idx}回\r\n`);
        appendFileSync(fileName, content);
        idx += 1;

        const nextReg = this.getNovelContentNextPageUrlReg();
        if (nextReg) {
          const np = nextReg.exec(buf);
          if (np && np.groups && np.groups.url) {
            const nextBuf = (await parallelHandle(
              (u, opts) => getContent(u, { ...fetchOpts, ...opts }),
              [np.groups.url],
              1
            ))[0];
            bufPool.splice(j + 1, 0, nextBuf);
          }
        }
      } catch (error) {
        if (
          error instanceof Error &&
          typeof error.message === 'string' &&
          error.message.includes('Debug HTML dumped to')
        ) {
          throw error;
        }

        this._throwWithDebugDump({
          stage: 'chapter-crash',
          url: chapterUrl,
          html: buf,
          debugDumpDir,
          message: `Chapter parsing crashed for ${chapterUrl}`,
          cause: error,
        });
      }
    }

    if (!outFileInit) writeFileSync(fileName, '');
    return { fileName, title, chapters: idx - 1 };
  }
}
