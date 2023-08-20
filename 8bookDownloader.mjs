import fs from 'fs';

import puppeteer from 'puppeteer';

(async () => {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  // https://pptr.dev/guides/request-interception
  await page.setRequestInterception(true);

  // https://pptr.dev/guides/debugging/#debugging-methods-for-client-code
  // page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  const txtUrlPromise = new Promise((res, rej) => {
    const callback = interceptedRequest => {
      // if (interceptedRequest.isInterceptResolutionHandled()) return;
      // if (
      //   interceptedRequest.url().endsWith('.png') ||
      //   interceptedRequest.url().endsWith('.jpg')
      // )
      //   interceptedRequest.abort();
      // else interceptedRequest.continue();

      // request: https://8book.com/txt/9/138546/27121357991.html
      // console.debug('request:', interceptedRequest.url());
      const url = interceptedRequest.url();
      if (url.startsWith('https://8book.com/txt/')) {
        // console.debug('url:', url);
        // console.debug('1111');
        // page.off('request', callback);
        // console.debug('1111222');
        res(url);
        // return interceptedRequest.abort();
      }
      interceptedRequest.continue();
    };

    page.on('request', callback);
    setTimeout(rej, 1000 * 10);
  });

  // Navigate the page to a URL
  // await page.goto('https://8book.com/novelbooks/138546/');
  const url = new URL('https://8book.com/novelbooks/121051/');
  await page.goto(url.href);
  // await page.waitForFunction(() => {
  //   console.debug('condtion:', document.querySelector("#text").textContent);
  //   return document.querySelector("#text").textContent !== '';
  // }, { timeout: 10000 });

  // page
  //   .waitForSelector('#myId')
  //   .then(() => console.log('got it'));

  const chapterBody = await page.content();

  // 1. find article area dom
  const articleAreaDom = chapterBody.matchAll(/<div class="subtitles.*?">(?<article>.*?)<script>/gsi).next().value.groups['article'];
  // console.debug('articleAreaDom:', articleAreaDom);

  // 2. find chapter link area doms
  const hrefs = Array.from(articleAreaDom.matchAll(/<a.*?href="(?<href>.*?)".*?>/gsi)).map(item => {
    if (item.groups['href'].startsWith('http')) {
      return item.groups['href'];
    };
    return `${url.origin}${item.groups['href']}`;
  });

  // 3. start to get content
  await page.goto(hrefs[0]);
  await page.content();
  const txtUrl = await txtUrlPromise;
  // console.debug('txtUrl:', txtUrl);
  const response = await page.goto(txtUrl);
  const contentBuffer = await response.buffer();
  const contentBufferText = contentBuffer.toString('utf-8');
  // console.debug('contentBufferText:', contentBufferText);

  // 4. handle text & charset
  await page.waitForFunction(
    contentBufferText => {
      // const githubResponse = await fetch(
      //   `https://api.github.com/users/${username}`
      // );
      // const githubUser = await githubResponse.json();
      // // show the avatar
      // const img = document.createElement('img');
      // img.src = githubUser.avatar_url;
      // // wait 3 seconds
      // await new Promise((resolve, reject) => setTimeout(resolve, 3000));
      // img.remove();
      document.body.setHTML(contentBufferText);
      return true;
    },
    {},
    contentBufferText,
  );
  const contentBody = await page.content();
  // console.debug('contentBody:', contentBody);
  const bodyElement = await page.waitForSelector('body');
  const txtContent = await bodyElement.evaluate(dom => dom.innerText);
  // console.debug('txtContent:', txtContent);
  fs.writeFileSync('./output.txt', txtContent);

  // WIP: new tab, ref: https://www.tutorialspoint.com/puppeteer/puppeteer_handling_tabs.htm

  // const contentBody = await page.content();
  // const bodyElement = await page.waitForSelector('body');
  // const txtContent = await bodyElement.evaluate(dom => dom.innerText);
  // console.debug('contentBody:', contentBody);
  // console.debug('txtContent:', txtContent);
  // console.debug('txtContent:', txtContent);
  // fs.writeFileSync('./output.txt', txtContent);

  // debugger;
  // console.debug('body:', body);

  // format html to text
  // https://stackoverflow.com/questions/5002111/how-to-strip-html-tags-from-string-in-javascript

  // Set screen size
  //await page.setViewport({width: 1080, height: 1024});

  // Type into search box
  //await page.type('.search-box__input', 'automate beyond recorder');

  // Wait and click on first result
  //const searchResultSelector = '.search-box__link';
  //await page.waitForSelector(searchResultSelector);
  //await page.click(searchResultSelector);

  // Locate the full title with a unique string
  //const textSelector = await page.waitForSelector(
  //  'text/Customize and automate'
  //);
  //const fullTitle = await textSelector?.evaluate(el => el.textContent);

  // Print the full title
  //console.log('The title of this blog post is "%s".', fullTitle);

  await browser.close();
})();

