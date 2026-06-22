const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const defaultSleep = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
export function withRetry(inner, opts = {}) {
    const maxRetries = opts.maxRetries ?? 4;
    const base = opts.baseDelayMs ?? 500;
    const cap = opts.maxDelayMs ?? 15_000;
    const sleep = opts.sleep ?? defaultSleep;
    const random = opts.random ?? Math.random;
    const backoff = (attempt) => {
        const exp = Math.min(cap, base * 2 ** attempt);
        return exp / 2 + random() * (exp / 2);
    };
    return {
        async post(path, body) {
            let lastErr;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    const res = await inner.post(path, body);
                    if (attempt < maxRetries && RETRYABLE_STATUS.has(res.status)) {
                        await sleep(backoff(attempt));
                        continue;
                    }
                    return res;
                }
                catch (err) {
                    lastErr = err;
                    if (attempt >= maxRetries)
                        break;
                    await sleep(backoff(attempt));
                }
            }
            throw lastErr;
        },
    };
}
