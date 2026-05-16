import { appendFileSync } from 'node:fs';

const LOG_TIME_MAP = new Map();

function format(parts) {
  return parts.map((obj) => {
    try { return String(obj); } catch { return '<unprintable>'; }
  }).join(', ');
}

export function LOG(...msg) {
  try {
    console.log(format(msg));
  } catch (e) {
    console.log(e);
  }
}

export function ERROR(...msg) {
  try {
    console.log(format(msg));
    const joined = msg.map(String).join(' ');
    appendFileSync('error.txt', `${Date.now() / 1000} ${joined}\r\n`);
  } catch (e) {
    console.log(e);
  }
}

export function LOG_TIME(key, ...msg) {
  if (!LOG_TIME_MAP.has(key)) {
    LOG_TIME_MAP.set(key, Date.now());
  }
  try {
    console.log(format([...msg, key]));
  } catch (e) {
    console.log(e);
  }
}

export function LOG_TIME_END(key, ...msg) {
  if (LOG_TIME_MAP.has(key)) {
    const start = LOG_TIME_MAP.get(key);
    const gapMs = Date.now() - start;
    try {
      console.log(format([...msg, key, `#sec: ${gapMs}`]));
    } catch (e) {
      console.log(e);
    }
    LOG_TIME_MAP.delete(key);
  } else {
    ERROR(`No LOG_TIME before LOG_TIME_END, key: ${key}`);
  }
}

// exposed for tests
export const __internal = { LOG_TIME_MAP };
