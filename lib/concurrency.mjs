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

export async function parallelHandle(fn, items, workerNum = 6, timeoutMs = null) {
  const limit = pLimit(workerNum);
  const wrap = (item) => {
    const work = fn(item);
    if (timeoutMs == null) return work;
    return Promise.race([
      work,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(`parallelHandle timeout (${timeoutMs}ms)`)),
        timeoutMs
      )),
    ]);
  };
  return Promise.all(items.map((item) => limit(wrap, item)));
}
