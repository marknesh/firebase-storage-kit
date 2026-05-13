export interface UploadState {
  uploads: UploadItem[];

  batches: UploadBatch[];
}

export type UploadEvents = {
  progress: UploadItem;

  success: UploadItem;

  error: UploadItem;

  canceled: UploadItem;

  batchProgress: UploadBatch;

  change: UploadState;
};

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

  progress: number;

  bytesTransferred: number;

  totalBytes: number;

  status: UploadStatus;

  downloadURL?: string;

  error?: Error;
}

export interface UploadBatch {
  id: string;

  uploads: UploadItem[];

  totalProgress: number;

  completedCount: number;

  failedCount: number;
}
