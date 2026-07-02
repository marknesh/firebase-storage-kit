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

export interface UploadItem {
  id: string;
  file: File;
  path: string;
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  status: UploadStatus;
  downloadURL?: string;
  error?: Error;
  /** The current attempt number (1-based). The initial upload is attempt `1`; each retry increments it. */
  attempt?: number;
  /**
   * @deprecated Use {@link UploadItem.attempt} instead. Kept as an alias for backward compatibility and always mirrors `attempt`.
   */
  retryAttempt?: number;
  batchId?: string;
}

export interface UploadBatch {
  id: string;
  uploads: UploadItem[];
  totalProgress: number;
  completedCount: number;
  failedCount: number;
}
