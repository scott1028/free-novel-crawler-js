#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class X23QBNovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<div class="d_title">.*?<h1>(?<title>.*?)<\/h1>/s;
  }
  getArticleAreaReg() {
    return /<ul.*?id="chapterList".*?>.*?(?<article>.*?)<\/ul/s;
  }
  getChapterUrlsReg() {
    return /<li><a.*?href.*?="(?<url>.*?)">.*?<\/li>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return 'https://www.x23qb.com';
  }
  getNovelContentReg() {
    return /<div id="TextContent".*?>(?<content>.*?)<div.*?class="bd"/s;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new X23QBNovelGrabber({
    TXTENCODE: 'gbk',
    tip: 'ex: https://www.23qb.com/book/788/',
  }).run();
}
