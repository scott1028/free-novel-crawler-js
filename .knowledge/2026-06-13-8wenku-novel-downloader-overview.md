# 8wenkuNovelDownloader and lib Overview

Created: 2026-06-13

## Scope

This note records the current understanding of:

- `8wenkuNovelDownloader.mjs`
- `lib/NovelGrabber.mjs`
- `lib/http.mjs`
- `lib/playwrightFetcher.mjs`
- `lib/concurrency.mjs`
- `lib/textProcessor.mjs`

The project is a Node.js ESM crawler rewrite of an older Python novel crawler set.
It uses Node 18+ features and Playwright headless as the default page fetch path.

## Project Shape

- Runtime: Node.js ESM (`"type": "module"` in `package.json`)
- Test runner: `node --test 'tests/*.test.mjs'`
- Main dependencies:
  - `playwright`: browser-backed page fetching
  - `iconv-lite`: non-UTF-8 Chinese encodings such as `gbk` and `big5`
  - `he`: HTML entity decoding
  - `cheerio`: tolerant HTML-to-text extraction in text mode 5/6/7
  - `dotenv`: browser selection via `.env`
- No `tsconfig` or `webpack.config` was found during the initial inspection.

## Role of `8wenkuNovelDownloader.mjs`

`8wenkuNovelDownloader.mjs` is a thin site-specific adapter.
It extends `NovelGrabber` and only defines how this site should be parsed:

- `getTitleReg()`
  - Extracts the novel title from `<div id="title">...</div>`.
- `getArticleAreaReg()`
  - Extracts the chapter list area from `<table class="css">...</table>`.
- `getChapterUrlsReg()`
  - Extracts chapter URLs from `<td class="ccss"><a href="...">`.
- `getBaseNovelLinkUrlPrefix(url)`
  - Keeps the directory part of the index URL so relative chapter links can be joined correctly.
  - Example target format: `https://www.wenku8.net/novel/2/2586/index.htm`
- `getNovelContentReg()`
  - Extracts chapter content from `<div id="content">...</div>`.
- Runtime config:
  - `TXTENCODE: 'gbk'`
  - CLI tip: `ex: https://www.wenku8.net/novel/2/2586/index.htm`

This file should usually be changed only when the wenku8 page structure changes.

## Runtime Data Flow

```text
-----------------------------+
| User runs downloader        |
| node 8wenkuNovelDownloader  |
+-------------+---------------+
              |
              v
+-----------------------------+
| NovelGrabber.run()          |
| prompt URL/range/concurrency|
+-------------+---------------+
              |
              v
+-----------------------------+
| getContent(indexUrl)        |
| Playwright-backed fetch     |
+-------------+---------------+
              |
              v
+-----------------------------+
| Site regex extraction       |
| title/article/chapter hrefs |
+-------------+---------------+
              |
              v
+-----------------------------+
| Build and slice urlPool     |
| retriveStart / retriveStop  |
+-------------+---------------+
              |
              v
+-----------------------------+
| parallelHandle(getContent)  |
| workerNum + random delay    |
+-------------+---------------+
              |
              v
+-----------------------------+
| Extract chapter content     |
| getNovelContentReg()        |
+-------------+---------------+
              |
              v
+-----------------------------+
| contentHandle()             |
| CJK filter / HTML cleanup   |
+-------------+---------------+
              |
              v
+-----------------------------+
| Write done-title-time.txt   |
+-----------------------------+
```

## `NovelGrabber` Responsibilities

`lib/NovelGrabber.mjs` is the shared crawler engine.

Main responsibilities:

- Prompt runtime options:
  - target URL
  - start page number
  - stop page number
  - parallel worker count
  - fixed delay
  - random delay
- Fetch the index page.
- Use subclass regexes to extract:
  - title
  - article/chapter list area
  - chapter URLs
  - chapter content
- Convert chapter page numbers to slice indices:
  - positive `retriveStart` is 1-based inclusive
  - negative `retriveStart` works like array slicing from the end
  - positive `retriveStop` becomes an exclusive slice end
  - negative `retriveStop` is resolved relative to the full chapter count
- Fetch chapters with `parallelHandle()`.
- Write output to:
  - `done-${title}-${timestamp}.txt`
- Optionally write raw chapter buffers when `saveRawBuf` is enabled.
- Dump debug HTML when parsing fails:
  - title miss: `index-title-miss`
  - article miss: `index-article-miss`
  - chapter content miss: `chapter-content-miss`
  - unexpected chapter parse crash: `chapter-crash`

Important behavior:

- If `fetchImpl` is injected, tests can bypass real Playwright.
- If real Playwright is used, `run()` closes the browser in `finally`.
- `getNovelContentNextPageUrlReg()` is optional and defaults to `null`.

## HTTP and Browser Fetching

`lib/http.mjs` exposes `getContent(url, options)`.

It handles:

- retry loop
- per-request sleep
- timeout via `AbortController`
- browser-like request headers
- cookie jar for mock or non-Playwright fetch paths
- response decoding:
  - Playwright path returns `response.__decoded` as string
  - non-Playwright path can decode bytes through `iconv-lite`
  - HTML entities are decoded through `he`
- empty response logging through `ERROR()`

`lib/playwrightFetcher.mjs` is the default fetch implementation.

It handles:

- `.env` loading
- browser selection through `BROWSER`
  - default: `firefox`
  - supported: `chrome`, `chromium`, `firefox`, `webkit`
- singleton browser/context/page-pool setup
- `page.goto(url, { waitUntil: 'domcontentloaded' })`
- returning a fetch-like object with:
  - `ok`
  - `status`
  - `headers.getSetCookie()`
  - `__decoded`
  - `arrayBuffer()`

The README says this Playwright path is used to avoid Cloudflare/TLS fingerprint problems that happen with plain Node fetch on some sites.

## Concurrency

`lib/concurrency.mjs` provides:

- `pLimit(concurrency)`
  - local promise limiter
- `parallelHandle(fn, items, workerNum, timeoutMs, delayFn)`
  - dispatches work with a concurrency cap
  - when `delayFn` exists, it waits between dispatches
  - preserves result ordering with `Promise.all`

In `NovelGrabber`, chapter fetching uses:

```js
const delayFn = () => delayMs + Math.floor(Math.random() * randomDelayMs);
```

This means each chapter dispatch after the first is delayed by a fixed base plus a random component.

## Text Processing

`lib/textProcessor.mjs` provides the post-fetch cleanup pipeline:

1. `filterNonCJK(buf)`
   - removes characters outside configured CJK/ASCII/newline ranges.
2. `mainHandle(buf, treatAsPureText, skipTrim)`
   - removes script/style/template/font/comment blocks.
   - mode `1`-`4` use regex-based paired-tag handling.
   - mode `5`/`6`/`7` use Cheerio text extraction.
   - decodes HTML entities.
   - trims spaces, tabs, duplicate punctuation, and normalizes quote/sentence line breaks.
3. `postHandle(buf, chapterType, ocrMode, autoPagination)`
   - normalizes chapter headings.
   - supports OCR mode.
   - optionally splits long content into pseudo pages.
4. `contentHandle(buf, opts)`
   - calls the full pipeline.
   - default mode comes from `process.env.TXTMODE ?? '5'`.

## Test Coverage Observed

Relevant tests:

- `tests/NovelGrabber.test.mjs`
  - full pipeline with fixtures
  - prompt defaults
  - debug dump behavior
  - positive and negative chapter slicing
  - subclass abstract-method failures
- `tests/downloaders.test.mjs`
  - ensures all downloader modules load
  - ensures each downloader provides required regex methods
- `tests/http.test.mjs`
  - mock fetch, retry, cookie behavior
- `tests/concurrency.test.mjs`
  - limiter and timeout behavior
- `tests/textProcessor.test.mjs`
  - CJK filter, HTML cleanup, chapter splitting, pagination behavior

## Maintenance Notes

When a site stops working, inspect in this order:

1. Confirm the source site is still online and the URL format still matches the downloader tip.
2. Check whether the index page title regex still matches.
3. Check whether the article/chapter list regex still matches.
4. Check whether chapter hrefs are relative or absolute and whether `getBaseNovelLinkUrlPrefix()` still joins them correctly.
5. Check whether chapter content still lives inside the expected content container.
6. If parsing fails, inspect the dumped HTML under `.tmp/debug-*.html`.
7. If fetching fails before parsing, inspect Playwright/browser setup and `BROWSER` configuration.

For `8wenkuNovelDownloader.mjs`, the most likely breakpoints are:

- title container changed from `div#title`
- chapter list no longer uses `table.css`
- chapter cells no longer use `td.ccss`
- content container changed from `div#content`
- chapter hrefs changed from relative paths to another format

## Review Checklist for Future Changes

- [ ] Confirm the downloader still points to the intended site and URL format.
- [ ] Confirm all subclass regexes have named capture groups expected by `NovelGrabber`.
- [ ] Confirm `TXTENCODE` is correct for the source site.
- [ ] Confirm chapter URL joining is correct for relative links.
- [ ] Confirm parsing failure produces a useful debug dump.
- [ ] Run `npm test` after code changes.
- [ ] Manually confirm an AI review is performed with a different model after implementation.
- [ ] Self-check final explanation against the inspected files to avoid hallucinated project details.
