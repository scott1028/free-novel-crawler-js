# free-novel-crawler — Node ESM 重構版

把原本的 Python 爬蟲組（`../*Downloader.py`、`../lib/`、`../txtUtils.py`）
轉成 Node ESM (`.mjs`)。執行需要 **Node 18+**（用到內建 `fetch`、`node:test`、
`node:util.parseArgs`）。

## 安裝

```sh
cd refactor
npm install
```

## 使用

下載某站小說：

```sh
node czDownloader.mjs
# target url? https://czbooks.net/n/uh8aj
# Get From [n:]? (空字串=全抓)
```

對應 Python 版的 13 個 `*Downloader.py`，互動流程一致。

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

不是程式 bug，是站台用 Cloudflare 擋掉非瀏覽器流量。實測（2026-05）：

| Downloader | 狀態 | 根因 |
| --- | --- | --- |
| `novel543Downloader` | ✅ 可用 | header 補齊後可過 CF |
| `timotxtDownloader` | ✅ 可用 | header 補齊後可過 CF |
| `8bookDownloader` | ✅ 可用 | header 補齊後可過 CF |
| `czDownloader` | ❌ 403 | Cloudflare 看 TLS 指紋擋，header 沒救 |
| `69shuDownloader` | ❌ 403 | 同上，且網域已搬到 `69shuba.com` |
| `23qbDownloader` | ❌ 403 | 同上，且網域已搬到 `23qb.com` |
| `ixdzsDownloader` | ❌ DNS 失敗 | `tw.ixdzs.com` 連不上 |
| `tsnwbDownloader` | ❌ DNS 失敗 | `tsnwb.org` 連不上 |
| `quanben5Downloader` | ❌ DNS 失敗 | `big5.quanben5.com` 連不上 |

兩種獨立成因：

1. **Header 太陽春** — 只送 `User-Agent` 而少了 `Accept` / `Accept-Language` /
   `Sec-Fetch-*` 群組，會被當 bot。`lib/http.mjs` 的 `defaultBrowserHeaders()`
   已補齊（對應 Chrome 75 時代的 header 集合）。修完這個 novel543 / timotxt /
   8book 立刻能跑。
2. **Cloudflare 看 TLS 指紋 (JA3/JA4)** — Node 內建 `fetch` 走 undici，TLS
   handshake 被指紋識別為「不是瀏覽器」直接 403。Python 的 `urllib` 也有相同
   問題；header 怎麼改都沒用。

**TLS 指紋擋的解法**（任一）：

- 用 `curl-impersonate` / `curl_cffi` 之類偽裝瀏覽器 TLS 指紋的 client，替換
  `lib/http.mjs` 裡 `fetchImpl` 的實作。
- 走 Playwright / Puppeteer 用真實 Chromium 抓頁面，再餵 HTML 給
  `contentHandle()`。
- 經由能繞 CF 的 proxy / scraping API（FlareSolverr 等）。

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

- 並行：Python 用 `multiprocessing.Pool`，這裡改成 `Promise + pLimit`（純 I/O
  bound，差不多）。
- HTML 解析：Python 端 mode 5/6/7 分別用 `html.parser` / `html5lib` / `lxml`，
  Node 端統一走 `cheerio`；CLI 參數仍接受 5/6/7。
- `lib/proxyInjector.py` Python 端已標註 `Kept but no used for now`，未移植。
- regex 命名群組 `(?P<x>...)` 全改成 ES2018 `(?<x>...)`；`re.DOTALL` 用 `s` flag。
- 字元範圍 `filter_non_CJK_unicode` 改成單一 `RegExp` 一次掃完，行為與 Python 端
  的 5 個 OR 條件等價。
