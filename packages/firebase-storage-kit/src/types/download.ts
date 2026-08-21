export interface DownloadStreamOptions {
  /** Called as chunks are consumed from the returned stream. */
  onProgress?: (loaded: number, total: number) => void;
  /** Cancels the request and stream when aborted. */
  signal?: AbortSignal;
}

export interface DownloadStreamResult {
  /** The object's MIME type when available. */
  contentType?: string;
  /** The streamed object bytes. */
  stream: ReadableStream<Uint8Array>;
  /** Total object size in bytes. */
  totalBytes: number;
}
