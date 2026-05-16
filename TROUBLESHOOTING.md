# TROUBLESHOOTING

本檔記錄本專案歷來踩過的坑、根因與修正方式, 方便日後遇到類似症狀時快速定位。
新增條目時請複製文末的 **Entry Template**, 並更新 **Index**。

---

## Index

| # | Date | Tags | Title |
|---|------|------|-------|
| 001 | 2026-05-16 | `perf` `regex` `mainHandle` | `stripPairedTag` 在純 CJK 大檔上 catastrophic backtracking |

---

## 001 — `stripPairedTag` 在純 CJK 大檔上 catastrophic backtracking

- **Date**: 2026-05-16
- **Tags**: `perf`, `regex`, `mainHandle`
- **Affected files**: `lib/textProcessor.mjs`
- **Symptom area**: `node txtUtils.mjs` 處理 700KB+ 的 CJK 純文字小說檔

### 描述 (Symptom)

跑 `node txtUtils.mjs` 處理兩個約 770KB 的 CJK 小說 `.txt` 檔 (預設
`mode='2'`) 時, 在輸入 `encoding` / `concat` 後印出第一檔的
`[mainHandle][iter 1] prev=0 -> handling N chars...` 與 `MODE: 2`
之後就長時間沒有輸出, 表面上像 deadlock。實測 >120 秒仍未產出 `done-*.txt`。

### 根因 (Root cause)

`lib/textProcessor.mjs` 的 `stripPairedTag` 使用 regex pattern:

```
<(.{0,1000}?)(?: |.){0,1000}?>(.{0,1000}?)</\1>
```

`(?: |.){0,1000}?` 配合 lazy quantifier 在「含有 `<` 但實際上沒有任何完整 tag 對」
的長字串上會觸發 **catastrophic backtracking** —— regex engine 必須嘗試大量
組合才能確認沒有匹配, 對 280K+ 字串就會卡住非常久。

`mainHandle` 的收斂迴圈 (`while (prev !== curr)`) 每輪都會呼叫一次,
即使收斂迴圈本身正確, 單輪 regex 已經夠慢。

特別易踩的場景:
- 小說檔開頭常見書名標題包成 `<書名>` 形式 (e.g. `<圖書館天才少女～...～>`),
  整檔只有 1 個 `<`、1 個 `>`, **不是真正的 HTML tag**, 但會讓任何
  `if (!buf.includes('<'))` 形式的 fast-path 失效。

### 修正 (Fix)

在 `lib/textProcessor.mjs` 用「tag-like」regex 做廉價預檢, 沒有真正 HTML
開頭就完全跳過 `stripPairedTag` 與 `mainHandle.handle` 的整段 tag 處理:

```js
// '<' 後緊跟字母 / '!' / '/' 才像真正的 HTML 開頭;
// CJK 書名 "<書名>" 不會 match,避免 catastrophic backtracking。
const TAG_LIKE_REGEX = /<[A-Za-z!\/]/;

function stripPairedTag(buf, replacement, dotall) {
  if (!TAG_LIKE_REGEX.test(buf)) return buf;
  // ...原本的 pattern...
}

// mainHandle 內 handle():
if (!TAG_LIKE_REGEX.test(input) && !input.includes('&')) return input;
```

### 驗證 (Verification)

- `npm test` 全綠 (40/40), mode=2 / mode=5 / HTML entity 等 case 等價。
- 兩個 770KB CJK 檔 end-to-end: **>120s → ~2.2s** (40x+)。
- 觀察 log: `[mainHandle] converged after 1 iterations`, 不再卡在 iter 1。

### 後續注意 (Caveats)

- fast-path 條件**不能**只用 `!buf.includes('<')`, 必須區分 CJK 文字裡的 `<`
  與真正 HTML tag 的開頭。
- 若未來新增的 mode 會用到不同的 regex pattern, 同樣要評估是否在純 CJK
  大檔上會 backtracking。
- 真正想處理含書名 `<書名>` 之類 stray bracket 的清理, 應該另外設計
  專用 regex, 不要靠 `stripPairedTag` 順手處理。

---

## Entry Template

新增條目時複製以下骨架, 並把 **Index** 表格補上一行。

```markdown
## NNN — <一句話標題>

- **Date**: YYYY-MM-DD
- **Tags**: `tag1`, `tag2`
- **Affected files**: `path/to/file.mjs`
- **Symptom area**: 哪個指令 / 哪個 entry point 觸發

### 描述 (Symptom)

使用者觀察到什麼異常? 重現步驟、log、明顯特徵。

### 根因 (Root cause)

底層原因是什麼? 為什麼會這樣?(必要時引用程式碼片段或行號)

### 修正 (Fix)

實際改了哪幾行 / 哪個檔案。盡量只貼關鍵 diff, 不貼整檔。

### 驗證 (Verification)

- 既有測試: `npm test` 結果
- 手動實測: 指令、時間、輸出檔等

### 後續注意 (Caveats)

未來踩相同範疇問題時要記得的事; 與這個修正相關但沒做的延伸工作。
```
