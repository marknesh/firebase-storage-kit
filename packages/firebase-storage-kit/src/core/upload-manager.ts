import { Emitter } from "./emitter";

import type { StorageProvider } from "../providers/provider";

import type {
  UploadEvents,
  UploadItem,
  UploadState,
  UploadStatus,
} from "../types/upload";

import type { ProviderUploadTask, UploadOptions } from "../types/provider";

export class UploadManager extends Emitter<UploadEvents> {
  private uploads: UploadItem[] = [];

  constructor(private provider: StorageProvider) {
    super();
  }

  getState(): UploadState {
    return {
      uploads: this.uploads,

      batches: [],
    };
  }

  uploadFile(
    file: File,

    options: UploadOptions,
  ) {
    const upload: UploadItem = {
      id: crypto.randomUUID(),

      file,

      progress: 0,

      bytesTransferred: 0,

      totalBytes: file.size,

      status: "queued",
    };

    this.uploads.push(upload);

    this.emit("change", this.getState());

    const updateStatus = (status: UploadStatus) => {
      upload.status = status;

      this.emit("change", this.getState());
    };

    updateStatus("uploading");

    const task = this.provider.upload(
      file,

      options,

      {
        onProgress: (bytesTransferred, totalBytes) => {
          upload.bytesTransferred = bytesTransferred;

          upload.totalBytes = totalBytes;

          upload.progress = (bytesTransferred / totalBytes) * 100;

          this.emit("progress", upload);

          this.emit("change", this.getState());
        },

        onError: (error) => {
          upload.error = error;

          updateStatus("error");

          this.emit("error", upload);
        },

        onSuccess: (downloadURL) => {
          upload.downloadURL = downloadURL;

          upload.progress = 100;

          updateStatus("success");

          this.emit("success", upload);
        },
      },
    );

    return this.createTaskControls(upload, task);
  }

  private createTaskControls(
    upload: UploadItem,

    task: ProviderUploadTask,
  ) {
    return {
      upload,

      cancel: () => {
        task.cancel();

        upload.status = "canceled";

        this.emit("canceled", upload);

        this.emit("change", this.getState());
      },

      pause: () => {
        task.pause?.();

        upload.status = "paused";

        this.emit("change", this.getState());
      },

      resume: () => {
        task.resume?.();

        upload.status = "uploading";

        this.emit("change", this.getState());
      },
    };
  }
}
