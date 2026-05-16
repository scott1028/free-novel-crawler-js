import * as cheerio from 'cheerio';
import he from 'he';

import { LOG, LOG_TIME, LOG_TIME_END } from './logger.mjs';

// Ranges mirrored from textProcessor.py:
//   0x3001-0x303F  CJK punctuation
//   0x0020-0x007E  ASCII printable
//   0x4E00-0xFFEF  CJK unified ideographs + compat
//   0x000A         line feed
//   0x2026         "…"
// Anything outside these ranges is stripped.
const KEEP_REGEX = new RegExp(
  '[^\\u3001-\\u303F\\u0020-\\u007E\\u4E00-\\uFFEF\\u000A\\u2026]',
  'gu'
);

export function filterNonCJK(buf) {
  return buf.replace(KEEP_REGEX, '');
}

// Strip a single nested HTML tag pair; matches Python's
//   re.sub(r"<(.{0,1000}?)(?: |.){0,1000}?>(.{0,1000}?)</\1>", ...)
// `dotall` toggles whether `.` matches newlines (DOTALL in Python).
// Fast-path probe: a real HTML tag opens with '<' followed by a letter,
// '/', or '!'. Stray '<' from CJK content (e.g. book titles like
// "<書名>") never matches this, so we can skip the catastrophic-
// backtracking paired-tag regex entirely.
const TAG_LIKE_REGEX = /<[A-Za-z!\/]/;

function stripPairedTag(buf, replacement, dotall) {
  if (!TAG_LIKE_REGEX.test(buf)) return buf;
  const flags = dotall ? 'gs' : 'g';
  const pattern = new RegExp('<(.{0,1000}?)(?: |.){0,1000}?>(.{0,1000}?)</\\1>', flags);
  return buf.replace(pattern, replacement);
}

export function mainHandle(buf, treatAsPureText, skipTrim = false) {
  const handle = (input) => {
    LOG(`MODE: ${treatAsPureText}`);
    if (skipTrim) return input;
    // No real tag-open and no entity-ish '&' → tag-strip + he.decode are no-ops.
    if (!TAG_LIKE_REGEX.test(input) && !input.includes('&')) return input;
    let out = input;
    out = out.replace(/<script.*?<\/script>/gs, '');
    out = out.replace(/<style.*?<\/style>/gs, '');
    out = out.replace(/<template.*?<\/template>/gs, '');
    out = out.replace(/<fon.*?>.*?<\/font>/gs, '');
    out = out.replace(/<!--.*?-->/gs, '');

    switch (String(treatAsPureText)) {
      case '1':
        out = stripPairedTag(out, '', true);
        break;
      case '2':
        out = stripPairedTag(out, '$2', true);
        break;
      case '3':
        out = stripPairedTag(out, '', false);
        break;
      case '4':
        out = stripPairedTag(out, '$2', false);
        break;
      case '5':
      case '6':
      case '7': {
        // Python distinguished html.parser / html5lib / lxml; cheerio
        // collapses all three to one tolerant parser.
        const $ = cheerio.load(out);
        out = $.root().text();
        break;
      }
      default:
        break;
    }
    out = he.decode(out);
    return out;
  };

  let prev = '';
  let curr = buf;
  let iter = 0;
  while (prev !== curr) {
    iter += 1;
    LOG(`[mainHandle][iter ${iter}] prev=${prev.length} -> handling ${curr.length} chars...`);
    prev = curr;
    curr = handle(curr);
    LOG(`[mainHandle][iter ${iter}] curr=${curr.length} (delta=${curr.length - prev.length})`);
  }
  LOG(`[mainHandle] converged after ${iter} iterations, final=${curr.length}`);
  let out = curr;

  if (!skipTrim) {
    // c2/a0 = non-breaking space; same as Python's r"(?:\xc2|\xa0)+".
    out = out.replace(/(?:\xc2|\xa0)+/gs, ' ');
    out = out.replace(/^ +/gm, '');
    out = out.replace(/^ +/gm, '');
    out = out.replace(/ +$/gm, '');
    out = out.replace(/(?:\t)+/gm, '');

    // dedupe trailing punctuation: only the last one survives a run
    out = out.replace(/([﹖﹗。？！…])(?=\1)/gs, '');

    // wrap before/after quote characters
    out = out.replace(/([｢「])/gs, '\n$1');
    out = out.replace(/([｣」])/gs, '$1\n');
    out = out.replace(/((?:。){1}(?!｣|」))/gs, '$1\n');
    out = out.replace(/([｣｢]{1})/gm, '$1\n');

    out = out.replace(/(\n)+/gs, '$1');
  }
  return out;
}

export function postHandle(buf, chapterType, ocrMode, autoPagination) {
  let out = buf;

  const chapterHandler = (_match, chapterNo, chapterName) =>
    `\n\n第${chapterNo}章 ${chapterName}\n\n`;

  if (chapterType === 'number') {
    out = out.replace(/^(?<chapterNum>\d+)\n/gm, '\n\n第$<chapterNum>章\n\n');
  } else if (chapterType === '、') {
    out = out.replace(/^(?<chapterNo>\d+)、(?<chapterName>.*)\n/gm, chapterHandler);
  } else {
    out = out.replace(/^(?<chapterNo>\d+) (?<chapterName>.*)\n/gm, chapterHandler);
  }

  // collapse repeated trailing wraps
  out = out.replace(/(?:\r*\n)+$/gm, '\n');

  if (String(ocrMode) === '1') {
    let working = buf.replace(
      /^第(?<chapterNum>(?: ){0,}\d+(?: ){0,})(?:章|話)\n/gm,
      '@@@@第$<chapterNum>章@@@@'
    );
    let prev = '';
    let ocrIter = 0;
    while (prev !== working) {
      ocrIter += 1;
      LOG(`[postHandle/ocr][iter ${ocrIter}] working=${working.length}, stripping \\n...`);
      prev = working;
      working = working.replace(/\n/g, '');
    }
    LOG(`[postHandle/ocr] converged after ${ocrIter} iterations`);
    working = working.replace(
      /@@@@第(?<chapterNum>\d+)章@@@@/gm,
      '\n\n第$<chapterNum>章\n\n'
    );
    working = working.replace(/(?: )+/gm, '');
    working = working.replace(/(?<wrapWord>。)/gm, '$<wrapWord>\n');
    out = working;
  }

  if (String(autoPagination) !== '0') {
    const paginationSize = parseInt(autoPagination, 10);
    const paginationPosList = [];
    const maxPos = out.length - 1;
    let currPos = paginationSize;
    LOG(`[postHandle/pagination] size=${paginationSize}, totalLen=${out.length}`);
    while (currPos < maxPos) {
      const fragment = out.slice(currPos, currPos + paginationSize);
      const nl = fragment.indexOf('\n');
      const cut = currPos + (nl < 0 ? 0 : nl) + 1;
      paginationPosList.push(cut);
      LOG(`[postHandle/pagination] cursor=${currPos} -> cut=${cut} (${((currPos / maxPos) * 100).toFixed(1)}%)`);
      currPos += paginationSize;
    }
    paginationPosList.push(currPos);
    LOG(`[postHandle/pagination] total pages=${paginationPosList.length}`);
    let newOutput = '';
    for (let idx = 0; idx < paginationPosList.length; idx += 1) {
      const start = idx === 0 ? 0 : paginationPosList[idx - 1];
      const end = paginationPosList[idx];
      newOutput += `\n第${idx + 1}話\n\n` + out.slice(start, end);
    }
    return newOutput;
  }

  return out;
}

export function contentHandle(buf, opts = {}) {
  const {
    treatAsPureText = (process.env.TXTMODE ?? '5').toString().toUpperCase(),
    chapterType = 'text',
    ocrMode = '0',
    autoPagination = '0',
    skipTrim = false,
  } = opts;

  LOG_TIME('filter_non_CJK_unicode prepare');
  let out = filterNonCJK(buf);
  LOG_TIME_END('filter_non_CJK_unicode prepare');

  out = mainHandle(out, treatAsPureText, skipTrim);
  LOG_TIME('main_handle done');
  out = postHandle(out, chapterType, ocrMode, autoPagination);
  LOG_TIME_END('main_handle done');
  return out;
}
