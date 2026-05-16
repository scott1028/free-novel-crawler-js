import { firefox } from 'playwright';

import { LOG } from './logger.mjs';
import { pLimit } from './concurrency.mjs';

const POOL_SIZE = 5;

// Firefox ESR 115/128 時期的 UA。Sec-Fetch-* 群組是 Chromium-only，
// Firefox 不送，這邊也跟著拿掉以保持 header 指紋一致。
function buildUA() {
  const version = String(Math.floor(Math.random() * 14) + 115);
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
}

function defaultBrowserHeaders() {
  return {
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };
}

let browserPromise = null;
let contextPromise = null;
let pagePool = null;
let pageFreeList = null;
let poolLimit = null;

async function ensureBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    LOG('[playwright] launching firefox headless');
    const browser = await firefox.launch({ headless: true });
    return browser;
  })();
  return browserPromise;
}

async function ensureContext() {
  if (contextPromise) return contextPromise;
  contextPromise = (async () => {
    const browser = await ensureBrowser();
    return browser.newContext({
      userAgent: buildUA(),
      extraHTTPHeaders: defaultBrowserHeaders(),
      locale: 'zh-TW',
    });
  })();
  return contextPromise;
}

async function ensurePagePool() {
  if (pagePool) return pagePool;
  const context = await ensureContext();
  const pages = await Promise.all(
    Array.from({ length: POOL_SIZE }, () => context.newPage())
  );
  pagePool = pages;
  pageFreeList = [...pages];
  poolLimit = pLimit(POOL_SIZE);
  return pagePool;
}

function acquirePage() {
  // pageFreeList is only mutated inside poolLimit() critical sections of size <= POOL_SIZE,
  // so when we reach here a free page is guaranteed.
  return pageFreeList.pop();
}

function releasePage(page) {
  pageFreeList.push(page);
}

export async function playwrightFetch(url, init = {}) {
  await ensurePagePool();
  const timeout = init.__timeoutMs ?? 30000;

  return poolLimit(async () => {
    const page = acquirePage();
    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      });
      const status = response ? response.status() : 0;
      const ok = response ? response.ok() : false;
      const html = ok ? await page.content() : '';
      return {
        ok,
        status,
        headers: {
          getSetCookie: () => [],
        },
        __decoded: html,
        arrayBuffer: async () => new Uint8Array(Buffer.from(html, 'utf-8')).buffer,
      };
    } finally {
      releasePage(page);
    }
  });
}

export async function closeBrowser() {
  if (!browserPromise) return;
  try {
    if (contextPromise) {
      const context = await contextPromise;
      await context.close();
    }
    const browser = await browserPromise;
    await browser.close();
  } catch (e) {
    LOG('[playwright] closeBrowser error', e?.message ?? e);
  } finally {
    browserPromise = null;
    contextPromise = null;
    pagePool = null;
    pageFreeList = null;
    poolLimit = null;
  }
}
