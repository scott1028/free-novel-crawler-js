#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class CzNovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<span class="title">(?<title>.*?)<\/span>/s;
  }
  getArticleAreaReg() {
    return /<ul.*?id="chapter-list".*?>.*?(?<article>.*?)<\/ul>/s;
  }
  getChapterUrlsReg() {
    return /<li><a.*?href.*?="(?<url>.*?)".*?>.*?<\/li>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return 'https:';
  }
  getNovelContentReg() {
    return /<div.*?class.*?=.*?"content".*?>(?<content>.*?)<div.*?class.*?=.*?"notice">/s;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new CzNovelGrabber({
    TXTENCODE: 'utf-8',
    tip: 'ex: https://czbooks.net/n/uh8aj',
  }).run();
}
