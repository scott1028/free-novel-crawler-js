#!/usr/bin/env node
import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class Wenku8NovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<div.*?id="title".*?>(?<title>.*?)<\/div>/s;
  }
  getArticleAreaReg() {
    return /<table.*?class="css".*?>(?<article>.*?)<\/table>/s;
  }
  getChapterUrlsReg() {
    return /<td.*?class="ccss".*?>.*?<a href="(?<url>.*?)".*?>.*?<\/td>/gm;
  }
  getBaseNovelLinkUrlPrefix() {
    return '';
  }
  getNovelContentReg() {
    return /<div.*?id="content".*?>(?<content>.*?)<div.*?id="footlink"/s;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await new Wenku8NovelGrabber({
    TXTENCODE: 'gbk',
    tip: 'ex: https://www.wenku8.net/modules/article/reader.php?aid=2552',
  }).run();
}
