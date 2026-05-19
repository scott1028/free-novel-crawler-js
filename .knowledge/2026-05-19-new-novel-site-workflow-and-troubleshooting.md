# 新版小說網站支援 Workflow 與 Troubleshooting

## 目標

建立一套可重用的小說爬取流程，支援新版小說網站（以 `ixdzs.tw` 為例），並降低被 Cloudflare 偵測阻擋的風險。

## 適用情境

- 網站首頁（書籍詳情頁）只顯示部分章節。
- 需要額外請求目錄端點才能取得完整章節。
- 需要避免大量重複請求造成封鎖。

## 端到端流程（新版網站）

```text
Time ─────────────────────────────────────────────────────────────────────►
[Phase 0]         [Phase 1]           [Phase 2]         [Phase 3]          [Phase 4]
準備與節流         首頁最小請求          目錄補抓            章節抓取            輸出與驗證
    │                 │                  │                  │                  │
    ├─ 設定速率限制      ├─ GET 小說首頁       ├─ 解析 bid          ├─ 依 queue 抓章節     ├─ 合併正文
    │  + 隨機抖動        │  (只抓一次)         │                  │  (低併發)            │
    │                 │                  ├─ GET /novel/html   ├─ 失敗分級處理        ├─ 章節數一致性檢查
    ├─ 建立本機 cache     ├─ 存 raw HTML       │  (最多一次/版本)   │  + retry budget      │
    │  (URL->檔案)       │  供離線分析         │                  │                     ├─ 輸出 done-*.txt
    │                 │                  ├─ 合併/去重/排序      ├─ 可中斷續跑          │
    └─ 設定 run_id       └─ 抽出初始章節 links └─ 寫入 manifest     └─ 寫入章節快取        └─ 寫入報告
```

## Phase 0：準備與保護

- 設定全域速率限制：每次 request 間隔 `2.5s ~ 6s`（含 jitter）。
- 低併發：`concurrency=1~2`。
- 設定重試預算：單 URL 最多重試 2 次，退避可用 `5s -> 15s`。
- 建立本機快取：同一 URL 在同一 run 僅抓一次。
- 建立 `run_id`，用於隔離該次任務資料。

## Phase 1：首頁最小請求與落地

- 只請求一次小說首頁（書籍詳情頁）。
- 落地保存：
  - `raw/home.html`
  - `meta/home.headers.json`
  - `meta/home.status.json`
- 解析最小必要資料：書名、作者、`bid`、首頁章節連結。

## Phase 2：目錄補抓（新版站關鍵）

- 以 `bid` 請求目錄端點：`/novel/html/?bid=<id>`。
- 同步落地保存：
  - `raw/catalog.html`
  - `meta/catalog.status.json`
- 章節合併策略：
  - 先用首頁章節作 baseline。
  - 再用目錄結果補齊。
  - 以 URL/章節序號去重。
  - 依章節序排序。
- 產生 `manifest.json`（章節清單與抓取狀態）。

## Phase 3：章節抓取（低噪音）

- 只處理 `manifest` 內 `pending` 章節。
- 每章抓取前先查快取，避免二次請求。
- 落地保存：
  - `raw/chapters/<chapter_id>.html`
  - `parsed/chapters/<chapter_id>.txt`
  - `meta/chapters/<chapter_id>.json`
- 錯誤分級：
  - `429/403/5xx`：退避後小次數重試。
  - 偵測到 challenge/block page：立即熔斷停止後續請求。

## Phase 4：輸出與驗證

- 合併 `parsed/chapters/*.txt`，輸出 `done-<book>-<run_id>.txt`。
- 驗證項目：
  - manifest 章節總數 vs 成功抓取數
  - 空正文比例
  - 連續缺章告警
- 產生 `report.json`（成功率、失敗清單、阻擋狀態、建議續跑點）。

## 新增規範：站點接入初始驗證（Preflight，必做）

> 目的：不要等使用者回報「`done` 空內容」才處理。新站接入或站點改版時，必須在一開始就主動檢查目錄端點可用性與章節可解析性。

### Preflight 檢查流程（必做）

```text
Time ───────────────────────────────────────────────────────────────►
[Check 1]                  [Check 2]                         [Check 3]
目錄端點可用性             章節 URL 池完整性                 章節正文可解析性
    │                          │                                  │
    ├─ 先試 GET /novel/html     ├─ 至少抽樣 3 條章節 URL           ├─ 每條章節頁必須命中 <section>
    │  (?bid=...)               │  (頭/中/尾或 1~3 章)             │  或既定正文 selector
    │                          │                                  │
    ├─ 若 GET 為空/無 <li>      ├─ URL regex 命中率需達 100%       ├─ 不可全空；至少 1 章有有效內容
    │  立即 fallback POST       │  (抽樣範圍內)                    │  否則視為 parser 失效
    │  /novel/html (bid=...)    │                                  │
    │                          │                                  │
    └─ GET/POST 結果都要落地     └─ 失敗則禁止進入全量抓取          └─ 失敗則先修規則再重驗
```

### Preflight 驗收門檻（Gate）

- `Gate-1`：`GET /novel/html/?bid=...` 若回空（即使 HTTP 200）視為失敗，必須自動改試 `POST /novel/html/`。
- `Gate-2`：目錄結果必須至少包含 1 個章節 `<li><a href="/read/.../p...html">`；否則不得進入正式抓取。
- `Gate-3`：抽樣章節（建議先抓 1~3 章）中，正文 selector（例如 `<section>`）至少要成功解析 1 章，且不能全空。
- `Gate-4`：若 fallback 發生，必須在 `report.json` 或 log 記錄「GET empty -> POST fallback」事件，作為後續維運依據。

### 實作要求（必須）

- 目錄抓取策略採「`GET 優先 + POST fallback + 原始首頁章節保底`」。
- 不得因目錄端點失效而覆寫成空章節清單。
- 對應測試必須覆蓋以下情境：
  - GET 目錄回空
  - POST 目錄回正常章節
  - `done-*.txt` 仍有章節內容（非空檔）
- 發版前至少做一次小樣本線上驗證：固定抓 1~3 章，確認 `第1回/第2回/第3回` 與正文存在。

## Troubleshooting（先離線、少打站）

```text
抓取異常
  ↓
停止自動重試（避免連續 request）
  ↓
使用已落地 raw HTML 做本機 DOM 分析
  ↓
比對 selector / 結構差異 / 反爬頁特徵
  ↓
本機修 parser 規則
  ↓
用本機 raw 回放測試 parser
  ↓
通過後才進行少量線上驗證請求
```

### 常見異常與處置

- 空內容：先檢查是否抓到防爬頁，再看 selector 是否失效。
- 章節過少：確認是否正確補抓 `/novel/html/?bid=...`。
- 章節清單空但狀態碼 200：優先判定為目錄端點語義改變（例如 GET 不再回內容），立刻啟用 POST fallback 檢查。
- 大量 `403/429`：立即降速或暫停，避免連續重試。
- DOM 結構變更：先用本機 raw 修 parser，不要全量重跑。

## Cloudflare 風險控制守則

- 不高併發。
- 不短時間密集重試。
- 同 URL 同 run 僅抓一次。
- 優先離線分析，不把線上網站當 debug 沙盒。
- 一旦出現 block 特徵，立刻熔斷停止請求。

## 建議除錯目錄

```text
./debug/<run_id>/
  raw/
  parsed/
  meta/
  manifest.json
  report.json
```

## ixdzs.tw 範例

- 小說首頁：`https://ixdzs.tw/read/170541/`
- 目錄補抓：`https://ixdzs.tw/novel/html/?bid=170541`
- 目錄 fallback：`POST https://ixdzs.tw/novel/html/`，body：`bid=170541`
- 章節頁：`/read/170541/p1.html`, `/read/170541/p2.html`, ...
