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

export interface UploadOptions {
  path: string;
}
