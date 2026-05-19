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

      const listUrl = `${new URL(url).origin}/novel/html/?bid=${bidMatch.groups.bid}`;
      const listResponse = await baseFetchImpl(listUrl, init);
      const listHtml = await responseToHtml(listResponse);
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
