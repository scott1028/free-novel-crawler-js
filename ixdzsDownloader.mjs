#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class IxdzsNovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<div.*?class="d_info".*?>.*?<h1>(?<title>.*?)<\/h1>/s;
  }
  getArticleAreaReg() {
    return /<div.*?id="i-chapter".*?>.*?(?<article>.*?)<\/div>/s;
  }
  getChapterUrlsReg() {
    return /<li.*?><a.*?href.*?="(?<url>.*?)".*?>.*?<\/li>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return 'https://tw.ixdzs.com';
  }
  getNovelContentReg() {
    return /<div.*?class.*?=.*?"content".*?>(?<content>.*?)<div.*?class="line".*?>/s;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new IxdzsNovelGrabber({
    TXTENCODE: 'utf-8',
    tip: 'ex: https://tw.ixdzs.com/novel/%E9%83%BD%E5%B8%82%E4%BB%99%E7%8E%8B',
  }).run();
}
