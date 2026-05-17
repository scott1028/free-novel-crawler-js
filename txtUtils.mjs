#!/usr/bin/env node
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { stdin, stdout } from 'node:process';

import iconv from 'iconv-lite';

import { contentHandle } from './lib/textProcessor.mjs';
import { LOG } from './lib/logger.mjs';

const FILE_REGEX = /^(?<title>.*?)(?<ext>\.txt$|php$)/;

// readline/promises 的 question() 在 stdin EOF 時既不 resolve 也不 reject
// (nodejs/node#42454)，這會讓 `await runTxtUtils(...)` 永遠掛著、退出時印
// "Detected unsettled top-level await"。自己接 'line' / 'close' 確保
// pending question 一定會收尾。
// 跨多次 askLine() 共用的緩衝；stdin 可能在單次 chunk 中夾帶多行
// (e.g. `printf 'utf-8\nN\n'`)，得保留後面那行留給下次呼叫。
stdin.setEncoding('utf-8');
let stdinBuffer = '';
function askLine(prompt) {
  return new Promise((resolve, reject) => {
    stdout.write(prompt);

    const tryConsume = () => {
      const m = /\r?\n/.exec(stdinBuffer);
      if (!m) return false;
      const line = stdinBuffer.slice(0, m.index);
      stdinBuffer = stdinBuffer.slice(m.index + m[0].length);
      cleanup();
      resolve(line);
      return true;
    };

    const onData = (chunk) => {
      stdinBuffer += chunk;
      tryConsume();
    };
    const onEnd = () => {
      cleanup();
      // EOF 但還有未讀完的內容(沒換行)，視為最後一行；否則回空字串。
      const tail = stdinBuffer;
      stdinBuffer = '';
      resolve(tail);
    };
    const onErr = (e) => { cleanup(); reject(e); };

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.removeListener('end', onEnd);
      stdin.removeListener('close', onEnd);
      stdin.removeListener('error', onErr);
    };

    // 已經緩衝到一整行就直接消耗，不必等下一次 data。
    if (tryConsume()) return;

    // stdin 在前一次 askLine 期間若已 end，再掛 'end' listener 不會觸發。
    if (stdin.readableEnded) {
      const tail = stdinBuffer;
      stdinBuffer = '';
      resolve(tail);
      return;
    }

    stdin.on('data', onData);
    stdin.once('end', onEnd);
    stdin.once('close', onEnd);
    stdin.once('error', onErr);
    if (stdin.isPaused && stdin.isPaused()) stdin.resume();
  });
}

export async function runTxtUtils(opts = {}) {
  const {
    mode = '2',
    chapterType = 'text',
    ocrMode = '0',
    autoPagination = '0',
    encoding: encodingOverride = null,
    concat: concatOverride = null,
    cwd = process.cwd(),
  } = opts;

  let encoding = encodingOverride;
  let concat = concatOverride;
  if (encoding == null) encoding = (await askLine('encoding? ')).trim();
  if (concat == null) concat = (await askLine('concat? ')).trim();
  if (!encoding) encoding = 'utf-8';
  concat = (concat ?? '').toUpperCase();

  const t = String(Math.floor(Date.now() / 1000));
  const files = readdirSync(cwd)
    .filter((f) => {
      try { return statSync(`${cwd}/${f}`).isFile(); } catch { return false; }
    })
    .sort();

  const chunks = [];
  let lastMatch = null;

  let fileIdx = 0;
  for (const f of files) {
    const matched = FILE_REGEX.exec(f);
    if (!matched) continue;
    const ext = matched.groups.ext.toLowerCase();
    if (!(/(?:\.txt$|\.php$)/.test(ext))) continue;
    if (f.startsWith('done-')) continue;
    if (f.startsWith('requirements')) continue;

    fileIdx += 1;
    LOG(`[file ${fileIdx}] ${f}`);

    const raw = readFileSync(`${cwd}/${f}`);
    let buf = iconv.decode(raw, encoding);
    LOG(`[file ${fileIdx}][BUF][Start] ${buf.length}`);
    buf = contentHandle(buf, {
      treatAsPureText: String(mode),
      chapterType,
      ocrMode,
      autoPagination,
    });
    LOG(`[file ${fileIdx}][BUF][End] ${buf.length}`);

    lastMatch = matched;
    if (concat === 'N' || concat === '') {
      const outName = `done-${matched.groups.title}-${t}${matched.groups.ext}`;
      writeFileSync(`${cwd}/${outName}`, buf);
      LOG(`[file ${fileIdx}] wrote ${outName}`);
    } else {
      chunks.push(buf);
      LOG(`[file ${fileIdx}] appended to chunks (total chunks=${chunks.length})`);
    }
  }

  if (chunks.length > 0 && lastMatch) {
    const outName = `done-all-${lastMatch.groups.title}-${t}${lastMatch.groups.ext}`;
    writeFileSync(`${cwd}/${outName}`, chunks.join(''));
  }

  return { processed: files.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: '2' },
      chapter_type: { type: 'string', default: 'text' },
      ocr_mode: { type: 'string', default: '0' },
      auto_pagination: { type: 'string', default: '0' },
      // 不想互動時可直接帶；任一個沒給才會 prompt。
      encoding: { type: 'string' },
      concat: { type: 'string' },
    },
  });
  try {
    await runTxtUtils({
      mode: values.mode,
      chapterType: values.chapter_type,
      ocrMode: values.ocr_mode,
      autoPagination: values.auto_pagination,
      encoding: values.encoding ?? null,
      concat: values.concat ?? null,
    });
  } finally {
    // askLine 留著 stdin 在 flowing；明確結束避免 event loop 停不下來。
    stdin.pause();
    if (typeof stdin.unref === 'function') stdin.unref();
  }
}
