#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class TimotxtNovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<a.*?href=".*?".*?aria-current="page".*?>(?<title>.*?)<\/a>/s;
  }
  getArticleAreaReg() {
    return /<div.*?class="header.*?has-btn">.*?(?<article>.*?)<\/ul><div.*?class="gadBlock"/s;
  }
  getChapterUrlsReg() {
    return /<li><a.*?href.*?="(?<url>.*?)".*?>.*?<\/li>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return 'https://www.timotxt.com';
  }
  getNovelContentReg() {
    return /<div.*?class.*?=.*?"chapter-content.*?".*?>(?<content>.*?)<a .*?target="_blank">目錄</s;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new TimotxtNovelGrabber({
    TXTENCODE: 'utf-8',
    tip: 'ex: https://www.timotxt.com/2105128652/dir',
  }).run({ workerNum: 1, sleepMs: 10, maxTries: 100, saveRawBuf: true });
}
