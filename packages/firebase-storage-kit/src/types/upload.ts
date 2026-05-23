/** The current state of the storage manager. */
export interface StorageState {
  uploads: UploadItem[];
  batches: UploadBatch[];
}

export type UploadStatus =
  | "queued"
  | "uploading"
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
  batchId?: string;
}

export interface UploadBatch {
  id: string;
  uploads: UploadItem[];
  totalProgress: number;
  completedCount: number;
  failedCount: number;
}
