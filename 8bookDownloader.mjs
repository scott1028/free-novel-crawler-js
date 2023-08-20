import puppeteer from 'puppeteer';

(async () => {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  // https://pptr.dev/guides/request-interception
  await page.setRequestInterception(true);

  // https://pptr.dev/guides/debugging/#debugging-methods-for-client-code
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  page.on('request', interceptedRequest => {
    // if (interceptedRequest.isInterceptResolutionHandled()) return;
    // if (
    //   interceptedRequest.url().endsWith('.png') ||
    //   interceptedRequest.url().endsWith('.jpg')
    // )
    //   interceptedRequest.abort();
    // else interceptedRequest.continue();

    // request: https://8book.com/txt/9/138546/27121357991.html
    // console.debug('request:', interceptedRequest.url());
    interceptedRequest.continue();
  });

  // Navigate the page to a URL
  // await page.goto('https://8book.com/novelbooks/138546/');
  await page.goto('https://8book.com/read/138546/?271213');
  await page.waitForFunction(() => {
    console.debug('condtion:', document.querySelector("#text").textContent);
    return document.querySelector("#text").textContent !== '';
  }, { timeout: 10000 });

  // page
  //   .waitForSelector('#myId')
  //   .then(() => console.log('got it'));

  const body = await page.content();
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

