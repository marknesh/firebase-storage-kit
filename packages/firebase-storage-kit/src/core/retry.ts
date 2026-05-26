import type { RetryOptions } from "../types/provider";

export interface ResolvedRetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  isRetryable?: (error: Error) => boolean;
}

export const DEFAULT_RETRY_OPTIONS: ResolvedRetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: true,
};

const NON_RETRYABLE_CODES = new Set([
  "storage/canceled",
  "storage/unauthorized",
  "storage/unauthenticated",
  "storage/quota-exceeded",
  "storage/invalid-argument",
  "storage/invalid-argument-count",
  "storage/invalid-url",
  "storage/invalid-default-bucket",
  "storage/no-default-bucket",
  "storage/bucket-not-found",
  "storage/project-not-found",
  "storage/invalid-root-operation",
  "storage/invalid-event-name",
  "storage/invalid-format",
  "storage/no-download-url",
  "storage/unauthorized-app",
  "storage/unsupported-environment",
]);

const RETRYABLE_CODES = new Set([
  "storage/retry-limit-exceeded",
  "storage/unknown",
  "storage/invalid-checksum",
  "storage/cannot-slice-blob",
  "storage/server-file-wrong-size",
]);

/** Resolves upload retry settings. Returns `null` when retries are disabled. */
export function resolveRetryOptions(
  retry?: RetryOptions | false,
): ResolvedRetryOptions | null {
  if (retry === false) return null;
  return {
    ...DEFAULT_RETRY_OPTIONS,
    ...retry,
  };
}

/** Reads a Firebase-style `code` from an error without importing Firebase types. */
export function getStorageErrorCode(error: Error): string | undefined {
  return (error as { code?: string }).code;
}

/** Whether an upload error should trigger another attempt. */
export function isRetryableStorageError(
  error: Error,
  options: ResolvedRetryOptions | null,
): boolean {
  if (!options) return false;

  if (options.isRetryable) {
    return options.isRetryable(error);
  }

  const code = getStorageErrorCode(error);
  if (code) {
    if (NON_RETRYABLE_CODES.has(code)) return false;
    if (RETRYABLE_CODES.has(code)) return true;
    return false;
  }

  return true;
}

/** Computes backoff delay after a failed attempt (1-based). */
export function computeRetryDelay(
  failedAttempt: number,
  options: ResolvedRetryOptions,
): number {
  const base = Math.min(
    options.maxDelayMs,
    options.initialDelayMs * 2 ** (failedAttempt - 1),
  );
  if (!options.jitter) return base;
  return Math.round(base * (0.5 + Math.random() * 0.5));
}
