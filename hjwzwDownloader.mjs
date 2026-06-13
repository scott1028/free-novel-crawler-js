#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class HjwzwNovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<h1>\s*(?<title>[^<]+?)\s*<\/h1>/s;
  }
  getArticleAreaReg() {
    return /<div[^>]*id=["']tbchapterlist["'][^>]*>(?<article>[\s\S]*?)<\/div>/s;
  }
  getChapterUrlsReg() {
    return /<a[^>]+href=["'](?<url>\/Book\/Read\/\d+,\d+)["'][^>]*>[\s\S]*?<\/a>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return 'https://tw.hjwzw.com';
  }
  getNovelContentReg() {
    return /<div[^>]*>\s*請記住本站域名:[\s\S]*?<a[^>]+href=["']\/Book\/\d+["'][^>]*>[\s\S]*?<\/a>[\s\S]*?<p\s*\/?>\s*(?<content>[\s\S]*?)<\/div>\s*(?:<div[^>]*>\s*請記住本站域名:[\s\S]*?<\/div>\s*)?(?:<div[^>]*id=["']Pan_Ad2["']|<div[^>]*>\s*快捷鍵:)/s;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new HjwzwNovelGrabber({
    TXTENCODE: 'utf-8',
    tip: 'ex: https://tw.hjwzw.com/Book/Chapter/33778',
  }).run();
}
