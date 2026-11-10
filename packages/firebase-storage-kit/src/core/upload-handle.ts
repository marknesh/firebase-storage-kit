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
  private current: UploadItem;
  private task: ProviderUploadTask | null = null;
  private readonly onChange: () => void;
  private terminated = false;
  private controlHooks: UploadControlHooks | null = null;
  private pausedDuringRetry = false;

  constructor(upload: UploadItem, onChange: () => void) {
    super();
    this.current = upload;
    this.onChange = onChange;
  }

  /**
   * Latest snapshot of this upload. Treat it as read-only: every change creates a new object,
   * so `prev !== next` tells you something changed (safe for `React.memo`, `useMemo` deps, etc.).
   */
  get upload(): UploadItem {
    return this.current;
  }

  /** @internal */
  _isTerminated(): boolean {
    return this.terminated;
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
    this.update({ status });
    this.emit("statusChange", this.upload);
  }

  /** @internal */
  _reportProgress(bytesTransferred: number, totalBytes: number): void {
    if (this.terminated) {
      return;
    }
    this.update({
      bytesTransferred,
      progress: totalBytes > 0 ? (bytesTransferred / totalBytes) * 100 : 0,
      totalBytes,
    });
    if (this.upload.status !== "uploading") {
      this._setStatus("uploading");
    }
    this.emit("progress", this.upload);
    this.onChange();
  }

  /** @internal */
  _prepareAttempt(attempt: number): void {
    if (this.terminated) {
      return;
    }
    this.update({
      attempt,
      bytesTransferred: 0,
      error: undefined,
      progress: 0,
      retryAttempt: attempt,
    });
    this.pausedDuringRetry = false;
    this._setStatus("uploading");
    this.onChange();
  }

  /** @internal */
  _enterRetryBackoff(details: UploadRetryBackoffDetails): void {
    if (this.terminated) {
      return;
    }
    this.update({
      attempt: details.attempt,
      error: details.error,
      retryAttempt: details.attempt,
    });
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
    this.update({ downloadURL, progress: 100 });
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
    this.update({ error });
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
    if (this.controlHooks) {
      this.controlHooks.abort();
    } else {
      this.task?.cancel();
    }
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

  // ==========================================

  /** Replaces the snapshot instead of mutating it, so consumers can detect changes by reference. */
  private update(patch: Partial<UploadItem>): void {
    this.current = { ...this.current, ...patch };
  }
}
