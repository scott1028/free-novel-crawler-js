import iconv from 'iconv-lite';
import he from 'he';

import { LOG, ERROR } from './logger.mjs';
import { playwrightFetch } from './playwrightFetcher.mjs';

// host -> "k=v; k2=v2"; mirrors Python's http.cookiejar usage.
// 預設 fetchImpl 改成 playwright 後不再使用，但保留為 export 供測試 mock 路徑使用。
const COOKIE_JAR = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Chrome 70–79 是 2018Q4–2019Q4 出的版本；對應到原 Python 端
// Mac OS X 11_0_1 是 Big Sur (2020)，跟那段時期的 Chrome 同期可信。
function buildUA() {
  const version = String(Math.floor(Math.random() * 10) + 70);
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 11_0_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.1916.47 Safari/537.36`;
}

// 真正能影響 Cloudflare 等 WAF 判斷的是「瀏覽器一次送什麼」的完整 header
// 群組。只送 User-Agent 而少了 Accept/Sec-Fetch-* 群組會被當作 bot。
// 注意：Sec-Fetch-* 是 Chrome 76+ 才有的；既然 UA 範圍包含 76–79，附帶上去
// 不會與 UA 矛盾。
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

function updateCookies(url, response) {
  const host = new URL(url).host;
  // node fetch returns headers; getSetCookie() is the standard way to read multiple Set-Cookie.
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  if (cookies.length === 0) return;
  const existing = COOKIE_JAR.get(host) ?? '';
  const pairs = cookies.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
  COOKIE_JAR.set(host, existing ? `${existing}; ${pairs}` : pairs);
}

function buildHeaders(url) {
  const headers = {
    'User-Agent': buildUA(),
    ...defaultBrowserHeaders(),
  };
  const host = new URL(url).host;
  const cookie = COOKIE_JAR.get(host);
  if (cookie) headers.Cookie = cookie;
  return headers;
}

export async function getContent(url, options = {}) {
  const {
    encoding = null,
    maxTries = 10,
    sleepMs = 1,
    fetchImpl = playwrightFetch,
    timeoutMs = 30000,
  } = options;

  let counter = 0;
  let buf = encoding == null ? Buffer.alloc(0) : '';

  while (counter <= maxTries) {
    try {
      await sleep(sleepMs);
      LOG(url, '[Start]', `(tried count: ${counter}, url: ${url})`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(url, {
          headers: buildHeaders(url),
          signal: controller.signal,
          __timeoutMs: timeoutMs,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      updateCookies(url, response);
      if (typeof response.__decoded === 'string') {
        // Playwright 路徑：chromium 已根據 Content-Type / <meta charset> 解好碼，
        // 直接拿字串；encoding 參數在這條路徑只決定回傳型別 (Buffer 或 string)。
        if (encoding == null) {
          buf = Buffer.from(response.__decoded, 'utf-8');
        } else {
          buf = he.decode(response.__decoded);
        }
      } else {
        const ab = await response.arrayBuffer();
        // ab is a fresh ArrayBuffer covering exactly the response body;
        // wrap it as a Buffer view that owns the full range.
        const bytes = Buffer.from(new Uint8Array(ab));
        if (encoding == null) {
          buf = bytes;
        } else {
          buf = he.decode(iconv.decode(bytes, encoding));
        }
      }
      const len = encoding == null ? buf.length : buf.length;
      LOG(url, '[Done]', `(tried count: ${counter}, url: ${url}, buf: ${len})`);
      break;
    } catch (e) {
      LOG(e?.message ?? e, url, counter);
      counter += 1;
      await sleep(counter * 1000);
    }
  }

  const isEmpty = encoding == null ? buf.length === 0 : buf === '';
  if (isEmpty) ERROR(url);
  return buf;
}

// exposed for tests
export const __internal = { COOKIE_JAR };
