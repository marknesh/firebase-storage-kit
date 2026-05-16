import { BatchHandle, type BatchOptions } from "./batch-handle";
import { UploadHandle } from "./upload-handle";

import type { StorageProvider } from "../providers/provider";
import type { UploadOptions } from "../types/provider";
import type { UploadItem, UploadState } from "../types/upload";

/**
 * Uploads files and tracks each upload or batch.
 *
 * You can react in two ways: call `.on(...)` on each {@link UploadHandle} / {@link BatchHandle}, **or** call `subscribe` to get the same lists
 * that {@link UploadManager.getState} returns whenever anything changes (call the returned function to stop listening).
 *
 */
export class UploadManager {
  private provider: StorageProvider;
  private uploadHandles: UploadHandle[] = [];
  private batches: BatchHandle[] = [];
  private changeListeners = new Set<(state: UploadState) => void>();
  private cachedState: UploadState | null = null;

  constructor(provider: StorageProvider) {
    this.provider = provider;
  }

  /** Current `uploads` and `batches` state. */
  getState = (): UploadState => {
    if (this.cachedState === null) {
      this.cachedState = {
        uploads: this.uploadHandles.map((h) => h.upload),
        batches: this.batches.map((b) => b.snapshot()),
      };
    }
    return this.cachedState;
  };

  /** Runs `listener` after each change; returns a function — call it to unsubscribe. */
  subscribe = (listener: (state: UploadState) => void): (() => void) => {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  };

  /** Starts the file upload.`options.path` is the object path in storage (see {@link UploadOptions}).
   *
   * @returns An {@link UploadHandle} to control the upload: `pause`, `resume`, `cancel`, and listen for progress with `.on`.
   */
  uploadFile(file: File, options: UploadOptions): UploadHandle {
    const handle = this.createHandle(file);
    this.uploadHandles.push(handle);
    this.notifyChange();
    this.startUpload(handle, options);
    return handle;
  }

  /**
   * Upload several files as one batch. The optional third argument sets how many run at once
   * and what happens when one file fails — see {@link BatchOptions}.
   *
   * @remarks
   * `optionsFor` picks storage options per file (same as `uploadFile`); index matches `files` order.
   * If `continueOnError` is `false`, the first failure cancels the other files and the batch fires `error`.
   * If it stays `true` (default), other files keep going; when every file has finished, the batch fires `success`.
   *
   */
  uploadFiles(
    files: File[],
    optionsFor: (file: File, index: number) => UploadOptions,
    batchOptions: BatchOptions = {},
  ): BatchHandle {
    const id = crypto.randomUUID();
    const handles = files.map((file) => this.createHandle(file, id));
    const optionsByUploadId = new Map<string, UploadOptions>();
    handles.forEach((h, i) => {
      const file = files[i];
      if (!file) return;
      optionsByUploadId.set(h.upload.id, optionsFor(file, i));
    });

    this.uploadHandles.push(...handles);

    const batch = new BatchHandle({
      id,
      uploads: handles,
      options: batchOptions,
      startNext: (handle) => {
        const opts = optionsByUploadId.get(handle.upload.id);
        if (!opts) return;
        this.startUpload(handle, opts);
      },
      onChange: () => this.notifyChange(),
    });

    this.batches.push(batch);
    this.notifyChange();
    batch._start();
    return batch;
  }

  private createHandle(file: File, batchId?: string): UploadHandle {
    const upload: UploadItem = {
      id: crypto.randomUUID(),
      file,
      progress: 0,
      bytesTransferred: 0,
      totalBytes: file.size,
      status: "queued",
      ...(batchId !== undefined ? { batchId } : {}),
    };
    return new UploadHandle(upload, () => this.notifyChange());
  }

  private startUpload(handle: UploadHandle, options: UploadOptions): void {
    handle._setStatus("uploading");
    const task = this.provider.upload(handle.upload.file, options, {
      onProgress: (bytesTransferred, totalBytes) =>
        handle._reportProgress(bytesTransferred, totalBytes),
      onError: (error) => handle._reportError(error),
      onSuccess: (downloadURL) => handle._reportSuccess(downloadURL),
    });
    handle._attachTask(task);
    this.notifyChange();
  }

  private notifyChange(): void {
    this.cachedState = null;
    const state = this.getState();
    for (const listener of this.changeListeners) {
      listener(state);
    }
  }
}
