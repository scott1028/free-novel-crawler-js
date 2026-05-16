import { chromium } from 'playwright';

import { LOG } from './logger.mjs';
import { pLimit } from './concurrency.mjs';

const POOL_SIZE = 5;

function buildUA() {
  const version = String(Math.floor(Math.random() * 10) + 70);
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 11_0_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.1916.47 Safari/537.36`;
}

function defaultBrowserHeaders() {
  return {
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
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
    LOG('[playwright] launching chrome stable headless');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
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
