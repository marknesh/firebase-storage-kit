import { Emitter } from "./emitter";

import type { ProviderUploadTask } from "../types/provider";
import type { UploadItem, UploadStatus } from "../types/upload";

export type UploadHandleEvents = {
  progress: UploadItem;
  success: UploadItem;
  error: UploadItem;
  canceled: UploadItem;
  statusChange: UploadItem;
};

/** Controls file upload and tracks its progress.
 *
 * @param upload The upload item to control.
 * @param onChange A function to call when the upload status changes.
 * @returns An {@link UploadHandle} to control the upload: `pause`, `resume`, `cancel`, and listen for progress with `.on`.
 */
export class UploadHandle extends Emitter<UploadHandleEvents> {
  public readonly upload: UploadItem;

  private task: ProviderUploadTask | null = null;
  private onChange: () => void;
  private terminated = false;

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
  _setStatus(status: UploadStatus): void {
    if (this.upload.status === status) return;
    this.upload.status = status;
    this.emit("statusChange", this.upload);
  }

  /** @internal */
  _reportProgress(bytesTransferred: number, totalBytes: number): void {
    if (this.terminated) return;
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
  _reportSuccess(downloadURL: string): void {
    if (this.terminated) return;
    this.terminated = true;
    this.upload.downloadURL = downloadURL;
    this.upload.progress = 100;
    this._setStatus("success");
    this.emit("success", this.upload);
    this.onChange();
  }

  /** @internal */
  _reportError(error: Error): void {
    if (this.terminated) return;
    this.terminated = true;
    this.upload.error = error;
    this._setStatus("error");
    this.emit("error", this.upload);
    this.onChange();
  }

  cancel(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.task?.cancel();
    this._setStatus("canceled");
    this.emit("canceled", this.upload);
    this.onChange();
  }

  pause(): void {
    if (this.terminated) return;
    if (this.upload.status !== "uploading") return;
    this.task?.pause?.();
    this._setStatus("paused");
    this.onChange();
  }

  resume(): void {
    if (this.terminated) return;
    if (this.upload.status !== "paused") return;
    this.task?.resume?.();
    this._setStatus("uploading");
    this.onChange();
  }
}
