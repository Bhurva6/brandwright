// Bounded-concurrency runner + retry/backoff — respects the shared 429 limits.

export function createLimiter(concurrency = 4) {
  let active = 0;
  const q = [];
  const pump = () => {
    if (active >= concurrency || q.length === 0) return;
    active++;
    const { fn, resolve, reject } = q.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => {
      active--;
      pump();
    });
  };
  return (fn) => new Promise((resolve, reject) => { q.push({ fn, resolve, reject }); pump(); });
}

export async function withRetry(fn, { tries = 5, base = 700 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = e?.status;
      // retry only on rate-limit / transient server errors
      if (status && status !== 429 && status < 500) throw e;
      if (i === tries - 1) break;
      const wait = base * 2 ** i + Math.random() * 300;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
