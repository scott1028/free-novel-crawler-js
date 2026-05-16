#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class Novel543NovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<div.*?class="headline">.*?<h1.*?>(?<title>.*?)<\/h1>/s;
  }
  getArticleAreaReg() {
    return /<div.*?class="read".*?>.*?<dl>.*?<\/dl>.*?<dl>(?<article>.*?)<\/dl>/s;
  }
  getChapterUrlsReg() {
    return /<a.*?href="(?<url>.*?)".*?>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return 'https://www.novel543.com';
  }
  getNovelContentReg() {
    return /<div.*?class="content".*?>.*?<p>(?<content>.*)<div.*?class="warp my-3 foot-nav"/s;
  }
  // Python source defined the regex then returned None; preserve the disabled state.
  getNovelContentNextPageUrlReg() {
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new Novel543NovelGrabber({
    TXTENCODE: 'utf-8',
    tip: 'ex: https://www.novel543.com/0401320355/dir',
  }).run();
}
