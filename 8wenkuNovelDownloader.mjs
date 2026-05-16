#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class EightWenkuNovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<div.*?id="title">(?<title>.*?)<\/div>/s;
  }
  getArticleAreaReg() {
    return /<table.*?class="css".*?>.*?(?<article>.*?)<\/table>/s;
  }
  getChapterUrlsReg() {
    return /<td class="ccss">.*?<a.*?href.*?="(?<url>.*?)".*?>.*?<\/td>/gm;
  }
  getBaseNovelLinkUrlPrefix(url) {
    // capture everything up to (and including) the last "/" so chapter hrefs
    // can be resolved against the directory portion of the index URL.
    const m = /^(?<url>https?:\/\/.*\/).*/.exec(url);
    return m ? m.groups.url : '';
  }
  getNovelContentReg() {
    return /<div id="content".*?>(?<content>.*?)<\/div>/s;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new EightWenkuNovelGrabber({
    TXTENCODE: 'gbk',
    tip: 'ex: https://www.wenku8.net/novel/2/2586/index.htm',
  }).run();
}
