export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const RETRY_DEFAULTS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...RETRY_DEFAULTS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= opts.maxRetries) break;

      const exponentialDelay = opts.baseDelayMs * opts.backoffMultiplier ** attempt;
      const jitter = Math.random() * opts.baseDelayMs;
      const delay = Math.min(exponentialDelay + jitter, opts.maxDelayMs);

      await sleep(delay);
    }
  }

  throw lastError;
}
