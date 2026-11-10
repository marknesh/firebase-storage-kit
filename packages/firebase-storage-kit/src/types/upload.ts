/** The current state of the storage manager. */
export interface StorageState {
  uploads: UploadItem[];
  batches: UploadBatch[];
}

export type UploadStatus =
  | "queued"
  | "uploading"
  | "retrying"
  | "paused"
  | "success"
  | "error"
  | "canceled";

/**
 * A snapshot of one upload. It never changes after you receive it: each update produces a new
 * object, so compare by reference (`prev !== next`) and read `handle.upload` again for the latest.
 */
export interface UploadItem {
  readonly id: string;
  readonly file: File;
  readonly path: string;
  readonly progress: number;
  readonly bytesTransferred: number;
  readonly totalBytes: number;
  readonly status: UploadStatus;
  readonly downloadURL?: string;
  readonly error?: Error;
  /** The current attempt number (1-based). The initial upload is attempt `1`; each retry increments it. */
  readonly attempt?: number;
  /**
   * @deprecated Use {@link UploadItem.attempt} instead. Kept as an alias for backward compatibility and always mirrors `attempt`.
   */
  readonly retryAttempt?: number;
  readonly batchId?: string;
}

export interface UploadBatch {
  id: string;
  uploads: UploadItem[];
  totalProgress: number;
  completedCount: number;
  failedCount: number;
}
