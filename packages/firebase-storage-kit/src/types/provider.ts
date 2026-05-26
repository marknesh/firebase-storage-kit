export interface ProviderUploadTask {
  cancel(): void;

  pause?(): void;

  resume?(): void;
}

export interface ProviderUploadCallbacks {
  onProgress: (bytesTransferred: number, totalBytes: number) => void;

  onError: (error: Error) => void;

  onSuccess: (downloadURL: string) => void;
}

export interface RetryOptions {
  /** Extra attempts after the first failure. Default: 3 (4 total tries). */
  maxRetries?: number;
  /** Initial backoff in ms. Default: 1000. */
  initialDelayMs?: number;
  /** Backoff cap in ms. Default: 30000. */
  maxDelayMs?: number;
  /** Apply jitter to backoff delays. Default: true. */
  jitter?: boolean;
  /** Override retry classification. */
  isRetryable?: (error: Error) => boolean;
}

export interface UploadOptions {
  /** Object path in the bucket (Firebase), e.g. `uploads/photo.jpg`. */
  path: string;
  /** Retries are enabled by default. Pass `false` to disable, or an object to customize. */
  retry?: RetryOptions | false;
}
