#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { NovelGrabber } from './lib/NovelGrabber.mjs';

export class BiqugeNovelGrabber extends NovelGrabber {
  getTitleReg() {
    return /<div id="info">.*?<h1>(?<title>.*?)<\/h1>/s;
  }
  getArticleAreaReg() {
    return /<div.*?id="list".*?>.*?(?<article>.*?)<\/div/s;
  }
  getChapterUrlsReg() {
    return /<dd>.*?<a.*?href.*?="(?<url>.*?)".*?>.*?<\/dd>/gm;
  }
  getBaseNovelLinkUrlPrefix(url) {
    return url;
  }
  getNovelContentReg() {
    return /<div id="content".*?>(?<content>.*?)<\/div>/s;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const defaultEncode = 'gbk';
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ans = (await rl.question(`encode? (default: ${defaultEncode})`)).trim();
  rl.close();
  const encode = ans || defaultEncode;
  console.log('encode:', encode);
  await new BiqugeNovelGrabber({
    TXTENCODE: encode,
    tip: 'ex: https://www.xbiquge.so/book/33615/',
  }).run();
}
