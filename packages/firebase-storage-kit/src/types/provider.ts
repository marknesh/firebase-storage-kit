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

export interface UploadValidationOptions {
  /** Maximum file size in bytes. */
  maxSizeBytes?: number;
  /** Allowed MIME types, e.g. `image/jpeg`. */
  allowedMimeTypes?: string[];
  /** Allowed file extensions including the dot, e.g. `.jpg`. */
  allowedExtensions?: string[];
  /** Maximum image width in pixels (checked for image files only). */
  maxImageWidth?: number;
  /** Maximum image height in pixels (checked for image files only). */
  maxImageHeight?: number;
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
  /** Optional pre-upload validation. Rejects before the provider upload starts. */
  validate?: UploadValidationOptions;
  /** Retries are enabled by default. Pass `false` to disable, or an object to customize. */
  retry?: RetryOptions | false;
  /** MIME type stored on the object (e.g. `image/jpeg`). */
  contentType?: string;
  /** App-specific string key/value pairs stored on the object.*/
  customMetadata?: Record<string, string>;
}
