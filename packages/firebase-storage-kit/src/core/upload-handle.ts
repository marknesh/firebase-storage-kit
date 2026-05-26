import type { ProviderUploadTask } from "../types/provider";
import type { UploadItem, UploadStatus } from "../types/upload";
import { Emitter } from "./emitter";

export interface UploadRetryEvent {
  upload: UploadItem;
  error: Error;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
}

export interface UploadRetryBackoffDetails {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: Error;
}

export interface UploadControlHooks {
  abort: () => void;
  pauseDuringRetry?: () => void;
  resumeDuringRetry?: () => void;
}

export interface UploadHandleEvents extends Record<string, unknown> {
  progress: UploadItem;
  success: UploadItem;
  error: UploadItem;
  canceled: UploadItem;
  statusChange: UploadItem;
  retry: UploadRetryEvent;
}

/** Controls file upload and tracks its progress.
 *
 * @param upload The upload item to control.
 * @param onChange A function to call when the upload status changes.
 * @returns An {@link UploadHandle} to control the upload: `pause`, `resume`, `cancel`, and listen for progress with `.on`.
 */
export class UploadHandle extends Emitter<UploadHandleEvents> {
  public readonly upload: UploadItem;

  private task: ProviderUploadTask | null = null;
  private readonly onChange: () => void;
  private terminated = false;
  private controlHooks: UploadControlHooks | null = null;
  private pausedDuringRetry = false;

  constructor(upload: UploadItem, onChange: () => void) {
    super();
    this.upload = upload;
    this.onChange = onChange;
  }

  /** @internal */
  _attachTask(task: ProviderUploadTask): void {
    this.task = task;
  }

  /** @internal */
  _registerControlHooks(hooks: UploadControlHooks): void {
    this.controlHooks = hooks;
  }

  /** @internal */
  _clearControlHooks(): void {
    this.controlHooks = null;
  }

  /** @internal */
  _setStatus(status: UploadStatus): void {
    if (this.upload.status === status) {
      return;
    }
    this.upload.status = status;
    this.emit("statusChange", this.upload);
  }

  /** @internal */
  _reportProgress(bytesTransferred: number, totalBytes: number): void {
    if (this.terminated) {
      return;
    }
    this.upload.bytesTransferred = bytesTransferred;
    this.upload.totalBytes = totalBytes;
    this.upload.progress =
      totalBytes > 0 ? (bytesTransferred / totalBytes) * 100 : 0;
    if (this.upload.status !== "uploading") {
      this._setStatus("uploading");
    }
    this.emit("progress", this.upload);
    this.onChange();
  }

  /** @internal */
  _prepareRetryAttempt(attempt: number): void {
    if (this.terminated) {
      return;
    }
    this.upload.retryAttempt = attempt;
    this.upload.bytesTransferred = 0;
    this.upload.progress = 0;
    this.upload.error = undefined;
    this.pausedDuringRetry = false;
    this._setStatus("uploading");
    this.onChange();
  }

  /** @internal */
  _enterRetryBackoff(details: UploadRetryBackoffDetails): void {
    if (this.terminated) {
      return;
    }
    this.upload.retryAttempt = details.attempt;
    this.upload.error = details.error;
    this.task = null;
    this._setStatus("retrying");
    this.emit("retry", {
      attempt: details.attempt,
      delayMs: details.delayMs,
      error: details.error,
      maxAttempts: details.maxAttempts,
      upload: this.upload,
    });
    this.onChange();
  }

  /** @internal */
  _reportSuccess(downloadURL: string): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    this.upload.downloadURL = downloadURL;
    this.upload.progress = 100;
    this._clearControlHooks();
    this._setStatus("success");
    this.emit("success", this.upload);
    this.onChange();
  }

  /** @internal */
  _reportError(error: Error): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    this.upload.error = error;
    this._clearControlHooks();
    this._setStatus("error");
    this.emit("error", this.upload);
    this.onChange();
  }

  cancel(): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    this.controlHooks?.abort();
    this.task?.cancel();
    this._clearControlHooks();
    this._setStatus("canceled");
    this.emit("canceled", this.upload);
    this.onChange();
  }

  pause(): void {
    if (this.terminated) {
      return;
    }
    if (this.upload.status === "uploading") {
      this.task?.pause?.();
      this._setStatus("paused");
      this.onChange();
      return;
    }
    if (this.upload.status === "retrying") {
      this.pausedDuringRetry = true;
      this.controlHooks?.pauseDuringRetry?.();
      this._setStatus("paused");
      this.onChange();
    }
  }

  resume(): void {
    if (this.terminated) {
      return;
    }
    if (this.upload.status !== "paused") {
      return;
    }

    if (this.pausedDuringRetry) {
      this.pausedDuringRetry = false;
      this.controlHooks?.resumeDuringRetry?.();
      this.onChange();
      return;
    }

    this.task?.resume?.();
    this._setStatus("uploading");
    this.onChange();
  }
}
