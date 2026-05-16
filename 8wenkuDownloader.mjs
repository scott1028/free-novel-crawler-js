#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class EightWenkuNovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<div id="info">.*?<h1>(?<title>.*?)<\/h1>/s;
  }
  getArticleAreaReg() {
    return /<div.*?id="list".*?>.*?(?<article>.*?)<\/div/s;
  }
  getChapterUrlsReg() {
    return /<dd>.*?<a.*?href.*?="(?<url>.*?)".*?>.*?<\/dd>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return 'http://www.8wenku.com';
  }
  getNovelContentReg() {
    return /<div id="content".*?>(?<content>.*?)<\/div>/s;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new EightWenkuNovelGrabber({
    TXTENCODE: 'gbk',
    tip: 'ex: http://www.8wenku.com/b/385',
  }).run();
}
