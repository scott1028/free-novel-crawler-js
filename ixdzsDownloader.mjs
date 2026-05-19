#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';
import { closeBrowser, playwrightFetch } from './lib/playwrightFetcher.mjs';

function responseToHtml(response) {
  if (typeof response.__decoded === 'string') return Promise.resolve(response.__decoded);
  return response.arrayBuffer().then((ab) => Buffer.from(new Uint8Array(ab)).toString('utf-8'));
}

function createSyntheticResponse(html) {
  return {
    ok: true,
    status: 200,
    headers: { getSetCookie: () => [] },
    __decoded: html,
    arrayBuffer: async () => new Uint8Array(Buffer.from(html, 'utf-8')).buffer,
  };
}

function hasChapterItems(html) {
  if (typeof html !== 'string' || html.length === 0) return false;
  return /<li[^>]*>\s*<a[^>]*href="\/read\/\d+\/p\d+\.html"/i.test(html);
}

export class IxdzsNovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<div.*?class="n-text".*?>.*?<h1>(?<title>.*?)<\/h1>/s;
  }
  getArticleAreaReg() {
    return /<ul.*?class="u-chapter cfirst".*?>(?<article>.*?)<\/ul>/s;
  }
  getChapterUrlsReg() {
    return /<li.*?><a.*?href.*?="(?<url>\/read\/\d+\/p\d+\.html)".*?>.*?<\/li>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return 'https://ixdzs.tw';
  }
  getNovelContentReg() {
    return /<article.*?class="page-content".*?>.*?<section>(?<content>.*?)<\/section>/s;
  }

  async run(options = {}) {
    const { fetchImpl, ...rest } = options;
    const baseFetchImpl = fetchImpl ?? playwrightFetch;
    const indexCache = new Map();

    const wrappedFetchImpl = async (url, init) => {
      const cached = indexCache.get(url);
      if (cached) return cached;

      const response = await baseFetchImpl(url, init);
      if (!/\/read\/\d+\/?$/.test(url)) return response;

      const indexHtml = await responseToHtml(response);
      const bidMatch = /<input[^>]*id="bid"[^>]*value="(?<bid>\d+)"/.exec(indexHtml)
        ?? /\/read\/(?<bid>\d+)\/?$/.exec(url);
      if (!bidMatch?.groups?.bid) return response;

      const origin = new URL(url).origin;
      const bid = bidMatch.groups.bid;
      const listGetUrl = `${origin}/novel/html/?bid=${bid}`;
      let listResponse = await baseFetchImpl(listGetUrl, init);
      let listHtml = await responseToHtml(listResponse);

      if (!hasChapterItems(listHtml)) {
        const listPostUrl = `${origin}/novel/html/`;
        listResponse = await baseFetchImpl(listPostUrl, {
          ...init,
          method: 'POST',
          headers: {
            ...(init?.headers ?? {}),
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: `bid=${encodeURIComponent(bid)}`,
        });
        listHtml = await responseToHtml(listResponse);
      }

      if (!hasChapterItems(listHtml)) {
        indexCache.set(url, response);
        return response;
      }

      const enrichedHtml = indexHtml.replace(
        /<ul class="u-chapter cfirst">[\s\S]*?<\/ul>/,
        `<ul class="u-chapter cfirst">${listHtml}</ul>`
      );
      const synthetic = createSyntheticResponse(enrichedHtml);
      indexCache.set(url, synthetic);
      return synthetic;
    };

    try {
      return await super.run({ ...rest, fetchImpl: wrappedFetchImpl });
    } finally {
      if (fetchImpl === undefined) await closeBrowser();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new IxdzsNovelGrabber({
    TXTENCODE: 'utf-8',
    tip: 'ex: https://ixdzs.tw/read/170541/',
  }).run();
}
