#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class TsnwbNovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<div.*?id="info".*?>.*?<h1>(?<title>.*?)<\/h1>/s;
  }
  getArticleAreaReg() {
    return /<div.*?id="list".*?>.*?<ul.*?class="chapters".*?>.*?(?<article>.*?)<\/ul>/s;
  }
  getChapterUrlsReg() {
    return /<li.*?class="chapter".*?><a.*?href.*?="(?<url>.*?)".*?>.*?<\/li>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return 'http://www.tsnwb.org';
  }
  getNovelContentReg() {
    return /<div.*?id="content".*?>(?<content>.*?)<div.*?class.*?=.*?"bottem2">/s;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new TsnwbNovelGrabber({
    TXTENCODE: 'gbk',
    tip: 'ex: http://www.tsnwb.org/7_7964/',
  }).run();
}
