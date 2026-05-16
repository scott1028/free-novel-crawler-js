#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class EightBookNovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<h2.*?>(?<title>.*?)<\/h2>/s;
  }
  getArticleAreaReg() {
    return /<div.*?class="subtitles".*?>(?<article>.*?)<\/div>/s;
  }
  getChapterUrlsReg() {
    return /<li.*?>.*?<a.*?href="(?<url>.*?)".*?>.*?<\/li>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return 'https://8book.com';
  }
  getNovelContentReg() {
    return /<div.*?id="text".*?>(?<content>.*?)<div.*?/s;
  }
  // Python source returned None despite defining the regex; mirror that.
  getNovelContentNextPageUrlReg() { return null; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new EightBookNovelGrabber({
    TXTENCODE: 'utf-8',
    tip: 'ex: https://8book.com/novelbooks/138546/',
  }).run();
}
