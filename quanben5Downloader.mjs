#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class Quanben5NovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<div.*?class="topbar">.*?<h1>(?<title>.*?)<\/h1>/s;
  }
  getArticleAreaReg() {
    return /<div.*?class="wrapper".*?>(?<article>.*?)<div class="footer".*?>/s;
  }
  getChapterUrlsReg() {
    return /<li.*?class="c3">.*?<a href="(?<url>.*?)".*?>.*?<\/li>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return 'http://big5.quanben5.com';
  }
  getNovelContentReg() {
    return /<div.*?id="content".*?>(?<content>.*?)<div.*?class="nlist_page"/s;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new Quanben5NovelGrabber({
    TXTENCODE: 'utf-8',
    tip: 'ex: http://big5.quanben5.com/n/quanseshengxiang/xiaoshuo.html',
  }).run();
}
