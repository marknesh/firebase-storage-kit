import { BatchHandle, type BatchOptions } from "./batch-handle";
import {
  computeRetryDelay,
  isRetryableStorageError,
  resolveRetryOptions,
} from "./retry";
import { UploadHandle } from "./upload-handle";

import type { StorageProvider } from "../providers/provider";
import type { FileMetadata } from "../types/metadata";
import type { ProviderUploadTask, UploadOptions } from "../types/provider";
import type { StorageState, UploadItem } from "../types/upload";

/**
 * Manages file uploads and storage queries.
 *
 * You can react in two ways: call `.on(...)` on each {@link UploadHandle} / {@link BatchHandle}, **or** call `subscribe` to get the same lists
 * that {@link StorageManager.getState} returns whenever anything changes (call the returned function to stop listening).
 *
 */
export class StorageManager {
  private provider: StorageProvider;
  private uploadHandles: UploadHandle[] = [];
  private batches: BatchHandle[] = [];
  private changeListeners = new Set<(state: StorageState) => void>();
  private cachedState: StorageState | null = null;
  private uploadOptionsByHandleId = new Map<string, UploadOptions>();

  constructor(provider: StorageProvider) {
    this.provider = provider;
  }

  /** Current `uploads` and `batches` state. */
  getState = (): StorageState => {
    if (this.cachedState === null) {
      this.cachedState = {
        uploads: this.uploadHandles.map((h) => h.upload),
        batches: this.batches.map((b) => b.snapshot()),
      };
    }
    return this.cachedState;
  };

  /** Runs `listener` after each change; returns a function — call it to unsubscribe. */
  subscribe = (listener: (state: StorageState) => void): (() => void) => {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  };

  /** Returns `true` if the object exists. Returns `false` only for not-found; other errors are thrown. */
  exists(path: string): Promise<boolean> {
    return this.provider.exists(path);
  }

  /** Returns metadata for the object at `path`. Throws if the object does not exist. */
  getMetadata(path: string): Promise<FileMetadata> {
    return this.provider.getMetadata(path);
  }

  /** Returns a download URL for the object at `path`. */
  getDownloadURL(path: string): Promise<string> {
    return this.provider.getDownloadURL(path);
  }

  /** Deletes the object at `path`. */
  delete(path: string): Promise<void> {
    return this.provider.delete(path);
  }

  /** Starts the file upload.`options.path` is the object path in storage (see {@link UploadOptions}).
   *
   * @returns An {@link UploadHandle} to control the upload: `pause`, `resume`, `cancel`, and listen for progress with `.on`.
   */
  uploadFile(file: File, options: UploadOptions): UploadHandle {
    const handle = this.createHandle(file, { path: options.path });
    this.uploadOptionsByHandleId.set(handle.upload.id, options);
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
    const handles = files.map((file, i) => {
      const options = optionsFor(file, i);
      const handle = this.createHandle(file, {
        batchId: id,
        path: options.path,
      });
      this.uploadOptionsByHandleId.set(handle.upload.id, options);
      return handle;
    });

    this.uploadHandles.push(...handles);

    const batch = new BatchHandle({
      id,
      uploads: handles,
      options: batchOptions,
      startNext: (handle) => {
        const options = this.uploadOptionsByHandleId.get(handle.upload.id) ?? {
          path: handle.upload.path,
        };
        this.startUpload(handle, options);
      },
      onChange: () => this.notifyChange(),
    });

    this.batches.push(batch);
    this.notifyChange();
    batch._start();
    return batch;
  }

  private createHandle(
    file: File,
    options: { path: string; batchId?: string },
  ): UploadHandle {
    const upload: UploadItem = {
      id: crypto.randomUUID(),
      file,
      path: options.path,
      progress: 0,
      bytesTransferred: 0,
      totalBytes: file.size,
      status: "queued",
      ...(options.batchId !== undefined ? { batchId: options.batchId } : {}),
    };
    return new UploadHandle(upload, () => this.notifyChange());
  }

  private startUpload(handle: UploadHandle, options: UploadOptions): void {
    const retryOptions = resolveRetryOptions(options.retry);
    const maxAttempts = retryOptions ? retryOptions.maxRetries + 1 : 1;

    let attempt = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let currentTask: ProviderUploadTask | null = null;
    let aborted = false;
    let pausedDuringRetry = false;
    let pendingRetryError: Error | null = null;

    const clearRetryTimeout = (): void => {
      if (retryTimeout !== null) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
    };

    const abort = (): void => {
      aborted = true;
      clearRetryTimeout();
      currentTask?.cancel();
      currentTask = null;
      pendingRetryError = null;
    };

    const scheduleRetry = (error: Error, delayMs: number): void => {
      if (aborted) return;

      pendingRetryError = error;
      handle._enterRetryBackoff({
        attempt: attempt + 1,
        maxAttempts,
        delayMs,
        error,
      });

      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        if (aborted || pausedDuringRetry) return;
        pendingRetryError = null;
        runAttempt();
      }, delayMs);
    };

    const runAttempt = (): void => {
      if (aborted) return;

      attempt += 1;
      handle._prepareRetryAttempt(attempt);

      currentTask = this.provider.upload(handle.upload.file, options, {
        onProgress: (bytesTransferred, totalBytes) =>
          handle._reportProgress(bytesTransferred, totalBytes),
        onError: (error) => {
          currentTask = null;
          if (aborted) return;

          if (
            attempt < maxAttempts &&
            isRetryableStorageError(error, retryOptions)
          ) {
            const delayMs = retryOptions
              ? computeRetryDelay(attempt, retryOptions)
              : 0;
            scheduleRetry(error, delayMs);
            return;
          }

          handle._reportError(error);
        },
        onSuccess: (downloadURL) => {
          currentTask = null;
          if (aborted) return;
          handle._reportSuccess(downloadURL);
        },
      });
      handle._attachTask(currentTask);
    };

    handle._registerControlHooks({
      abort,
      pauseDuringRetry: () => {
        pausedDuringRetry = true;
        clearRetryTimeout();
      },
      resumeDuringRetry: () => {
        if (aborted) return;
        pausedDuringRetry = false;
        if (pendingRetryError) {
          scheduleRetry(pendingRetryError, 0);
        }
      },
    });

    runAttempt();
  }

  private notifyChange(): void {
    this.cachedState = null;
    const state = this.getState();
    for (const listener of this.changeListeners) {
      listener(state);
    }
  }
}
