#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class SixNineshuNovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<div.*?class="bread".*?>.*?<a.*<\/a>.*?<a.*?>(?<title>.*?)<\/a>.*?<\/div>/s;
  }
  getArticleAreaReg() {
    return /<div.*?id="catalog".*?>(?<article>.*?)<\/div>/s;
  }
  getChapterUrlsReg() {
    return /<li.*?>.*?<a.*?href.*?="(?<url>.*?)".*?>.*?<\/li>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return '';
  }
  getNovelContentReg() {
    return /<div.*?class="txtnav".*?>(?<content>.*)<\/div>.*?<div.*?class.*?=.*?"page1">/s;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new SixNineshuNovelGrabber({
    TXTENCODE: 'gbk',
    tip: 'ex: https://www.69shu.com/A44201/',
  }).run();
}
