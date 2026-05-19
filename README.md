# free-novel-crawler — Node ESM 重構版

把原本的 Python 爬蟲組（`../*Downloader.py`、`../lib/`、`../txtUtils.py`）
轉成 Node ESM (`.mjs`)。執行需要 **Node 18+**（用到內建 `fetch`、`node:test`、
`node:util.parseArgs`）。

## 安裝

```sh
cd free-novel-crawler-js
npm install
```

`npm install` 會透過 `postinstall` 讀取 `.env` 並安裝需要的 Playwright browser；
也可以手動執行同一支安裝腳本：

```sh
node scripts/installPlaywrightBrowser.mjs
```

Playwright 預設用 `firefox.launch({ headless: true })` 啟動 patched Firefox 抓頁面，
藉此繞過 Cloudflare 的 TLS 指紋檢查。若要改用系統已安裝的 Chrome，請建立
`.env`：

```sh
cp .env.example .env
```

`.env.example` 預設會啟用 system Chrome：

```dotenv
BROWSER=chrome
# BROWSER=chromium
# BROWSER=firefox
# BROWSER=webkit
```

`.env` 不存在或 `BROWSER` 留空時，安裝腳本和程式都會 fallback 到 `firefox`。
若設定 `BROWSER=chrome`，安裝腳本會略過 Playwright browser 下載，程式執行時會使用
系統已安裝的 Chrome。

## 使用

下載某站小說：

```sh
node czDownloader.mjs
# target url? https://czbooks.net/n/uh8aj
# Start pageNo from [n:]? (empty=1, default=1, ex: -3 -> [..., n-2, n-1, n])
# End pageNo to [:m]? (empty=no limit, default=null, ex: -2 -> [...skipped, m-2, m-1, m])
# parallel? (default: 1) 1
# delayMs? (default: 3000) 3000
# randomDelayMs? (default: 3000) 1000
```

`parallel` 控制章節下載並行數；`delayMs` 是每次派發章節下載前的固定延遲；
`randomDelayMs` 會再加上一段 `0` 到該值之間的隨機延遲。以上問題輸入空字串時會使用
提示中的預設值。

本地檔案後處理（對應 `txtUtils.py`）：

```sh
node txtUtils.mjs --mode 5 --chapter_type text --ocr_mode 0 --auto_pagination 0
# encoding? utf-8
# concat?   N      # 或 Y 合併成單一 done-all-*.txt
```

掃描目前目錄的 `*.txt` / `*.php`，跳過 `done-*` 與 `requirements*`。

## 跑測試

```sh
npm test
```

涵蓋：`logger`、`textProcessor`（CJK 過濾／HTML 去除／章節切分／pagination）、
`concurrency`（限流、timeout）、`http`（mock fetch、retry、cookie）、
`NovelGrabber`（用 fixture 跑完整 pipeline）、`txtUtils`、所有 13 支 downloader
都載入並提供必要 regex。

## Troubleshooting

### 抓某些站直接拿 403

從 2026-05 起本專案已全面把 HTTP 取得換成 Playwright headless
(`lib/playwrightFetcher.mjs`)，原本被 Cloudflare TLS 指紋擋掉的站台已恢復可用。
未建立 `.env` 時預設使用 Firefox；若 `.env` 設定 `BROWSER=chrome`，會透過
`chromium.launch({ channel: 'chrome', headless: true })` 使用系統已安裝的 Chrome。
實測（2026-05）：

| Downloader | 狀態 | 備註 |
| --- | --- | --- |
| `novel543Downloader` | ✅ 可用 | |
| `timotxtDownloader` | ✅ 可用 | |
| `8bookDownloader` | ✅ 可用 | |
| `czDownloader` | ✅ 可用 | 改 Playwright 後過 CF；當時實測使用 Firefox |
| `69shuDownloader` | ✅ 可用 | 改 Playwright 後過 CF；當時實測使用 Firefox；網域已搬到 `69shuba.com` |
| `23qbDownloader` | ✅ 可用 | 改 Playwright 後過 CF；當時實測使用 Firefox；網域已搬到 `23qb.com` |
| `ixdzsDownloader` | ⚠️ 網域已搬遷 | 原 `tw.ixdzs.com` 已改為 `ixdzs.tw`（例：`https://ixdzs.tw/read/170541/`） |
| `tsnwbDownloader` | ❌ DNS 失敗 | `tsnwb.org` 連不上 |
| `quanben5Downloader` | ❌ DNS 失敗 | `big5.quanben5.com` 連不上 |

歷史背景（保留供 incident 追溯）：

1. **Header 太陽春** — 只送 `User-Agent` 而少了 `Accept` / `Accept-Language` /
   `Sec-Fetch-*` 群組，會被當 bot。`lib/playwrightFetcher.mjs` 的
   `defaultBrowserHeaders()` 透過 `extraHTTPHeaders` 補齊。
2. **Cloudflare 看 TLS 指紋 (JA3/JA4)** — Node 內建 `fetch` 走 undici，TLS
   handshake 被指紋識別為「不是瀏覽器」直接 403。改走 Playwright 啟動的瀏覽器
   後 TLS 指紋與真實瀏覽器一致，可過 CF。

DNS 失敗那幾站需要先確認來源網站是否還在線，不是這個 refactor 的範圍。

## Encoding 字串

Python 端的 `'utf-8'` / `'gbk'` / `'big5'` 等 encoding keyword **不是** JS 的
語言關鍵字，移植時當成字串值 1:1 沿用即可，**不需要替換**。`iconv-lite` 會
自動 normalize（小寫、忽略 `-`/`_`），所以 `'UTF-8'` / `'utf8'` / `'utf-8'`
對它等價。

⚠️ 新增 downloader 時，非 utf-8 編碼請繼續走 `iconv-lite`（透過
`lib/http.mjs` 的 `getContent(url, { encoding })` 或本檔的 `iconv.decode`）。
不要改用 Node 原生 `Buffer.toString(enc)` / `TextDecoder` /
`fs.readFile({ encoding })`，後者只認 WHATWG 標準名，中文編碼支援很有限：

| 編碼 | iconv-lite | Node 原生 |
| --- | --- | --- |
| `utf-8` / `utf8` | ✅ | ✅ |
| `gbk` | ✅ | ❌ |
| `big5` | ✅ | ❌ |
| `gb18030` | ✅ | ❌ |

## 與 Python 版差異

- 並行：Python 用 `multiprocessing.Pool`，這裡改成 `Promise + pLimit`，並發
  預設 1，可在 crawler 互動流程輸入 `parallel` 調整。
- HTTP 取得：改用 Playwright headless 取代 Node `fetch`，預設 Firefox，並可透過
  `.env` 的 `BROWSER` 改成 system Chrome / Chromium / WebKit；對外 API
  (`getContent`) 與 `fetchImpl` 注入介面維持相容。
- HTML 解析：Python 端 mode 5/6/7 分別用 `html.parser` / `html5lib` / `lxml`，
  Node 端統一走 `cheerio`；CLI 參數仍接受 5/6/7。
- `lib/proxyInjector.py` Python 端已標註 `Kept but no used for now`，未移植。
- regex 命名群組 `(?P<x>...)` 全改成 ES2018 `(?<x>...)`；`re.DOTALL` 用 `s` flag。
- 字元範圍 `filter_non_CJK_unicode` 改成單一 `RegExp` 一次掃完，行為與 Python 端
  的 5 個 OR 條件等價。
