import { sleep } from "../utils";
export { sleep };

export function calculateBackoff(attempt: number, baseDelay: number = 1000): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return exponentialDelay + jitter;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  const { maxRetries = 3, baseDelay = 1000, onRetry } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const data = await fn();
      return { success: true, data };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries - 1) {
        const delay = calculateBackoff(attempt, baseDelay);
        onRetry?.(attempt + 1, lastError);
        await sleep(delay);
      }
    }
  }

  return { success: false, error: lastError?.message || "Operation failed after retries" };
}
