export function pLimit(concurrency) {
  let active = 0;
  const queue = [];

  const next = () => {
    active -= 1;
    if (queue.length > 0) queue.shift()();
  };

  return (fn, ...args) => new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      Promise.resolve()
        .then(() => fn(...args))
        .then((v) => { resolve(v); next(); })
        .catch((e) => { reject(e); next(); });
    };
    if (active < concurrency) run();
    else queue.push(run);
  });
}

export async function parallelHandle(fn, items, workerNum = 1, timeoutMs = null, delayFn = null) {
  const limit = pLimit(workerNum);

  if (delayFn == null) {
    // Fast path: no delays, dispatch all immediately.
    return Promise.all(items.map((item) => wrapItem(fn, item, limit, timeoutMs)));
  }

  // Slow path: sequential delay between dispatches.
  const results = new Array(items.length);
  for (let i = 0; i < items.length; i += 1) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, delayFn(i)));
    }
    const ctx = { _delayMs: delayFn(i) };
    results[i] = wrapItem(fn, items[i], limit, timeoutMs, ctx);
  }
  return Promise.all(results);
}

function wrapItem(fn, item, limit, timeoutMs, ctx) {
  // Merge ctx into the options argument (2nd param) so getContent can read _delayMs.
  const fnWithContext = (...args) => {
    if (ctx && args.length >= 1) {
      args.push(ctx);
    }
    return fn(...args);
  };
  if (timeoutMs == null) {
    // No timeout: wrap in limit() to respect concurrency.
    return new Promise((resolve, reject) => {
      limit(() => fnWithContext(item)).then(resolve, reject);
    });
  }
  // Timeout path: race the work against a timer.
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`parallelHandle timeout (${timeoutMs}ms)`)), timeoutMs);
  });
  return new Promise((resolve, reject) => {
    limit(() => Promise.race([fnWithContext(item), timeoutPromise])).then(resolve, reject);
  });
}
