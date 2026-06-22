import type { HttpTransport } from "./ports.js";
export interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
}
export declare function withRetry(inner: HttpTransport, opts?: RetryOptions): HttpTransport;
