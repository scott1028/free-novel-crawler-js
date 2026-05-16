# txtUtils hangs on large CJK files

## Symptom

- **Date**: 2026-05-16
- **Affected files**: `lib/textProcessor.mjs`
- **Symptom area**: `node txtUtils.mjs` 處理 700KB+ 的 CJK 純文字小說檔

執行 `node txtUtils.mjs` 處理兩個約 770KB 的 CJK 小說 `.txt` 檔時，在輸入 `encoding` / `concat` 後，只印出第一檔的 `[mainHandle][iter 1] prev=0 -> handling N chars...` 與 `MODE: 2`，之後長時間沒有輸出，看起來像 deadlock。實測超過 120 秒仍未產出 `done-*.txt`。

根因是 `lib/textProcessor.mjs` 的 `stripPairedTag` 使用的 regex：

```js
<(.{0,1000}?)(?: |.){0,1000}?>(.{0,1000}?)</\1>
```

這個 pattern 在「含有 `<` 但其實沒有完整 tag 對」的長字串上會觸發 catastrophic backtracking。純 CJK 小說常出現 `<書名>` 這種不是 HTML tag 的內容，會讓單純 `buf.includes('<')` 的 fast-path 失效，導致 regex engine 花大量時間回溯。

## Resolution

修正方式是在 `lib/textProcessor.mjs` 加入廉價的 tag-like 預檢，只有當字串看起來真的像 HTML 開頭時，才進入 `stripPairedTag` 與 `mainHandle.handle` 的 tag 處理流程：

```js
const TAG_LIKE_REGEX = /<[A-Za-z!\/]/;
```

這樣 `<書名>` 之類的內容不會觸發昂貴的 regex，避免在大檔上卡住。先前失敗的方向是只檢查是否包含 `<`，這不足以區分 CJK 文字中的尖括號與真正的 HTML tag。

驗證結果：

- `npm test` 全綠。
- 兩個約 770KB 的 CJK 檔處理時間由超過 120 秒降到約 2.2 秒。
- log 顯示 `[mainHandle] converged after 1 iterations`，不再卡在第一輪。
