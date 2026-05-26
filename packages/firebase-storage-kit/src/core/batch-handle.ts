import type { UploadBatch, UploadItem } from "../types/upload";
import { Emitter } from "./emitter";
import type { UploadHandle, UploadRetryEvent } from "./upload-handle";

/**
 * Events on a batch from {@link StorageManager.uploadFiles}. `progress` / `change` carry a {@link UploadBatch} snapshot.
 * `uploadSuccess`, `uploadError`, and `uploadRetry` fire once per child (retry can fire multiple times per child). When all children are done: `success` (normal end) or `error` (only if `continueOnError` was `false` and one failed).
 */
export interface BatchHandleEvents extends Record<string, unknown> {
  progress: UploadBatch;
  uploadSuccess: UploadItem;
  uploadError: UploadItem;
  uploadRetry: UploadRetryEvent;
  success: UploadBatch;
  error: UploadBatch;
  change: UploadBatch;
}

/** Settings for {@link StorageManager.uploadFiles} (third argument). */
export interface BatchOptions {
  /** How many files upload at the same time. Default is 3. */
  concurrency?: number;
  /**
   * `true` (default): if one file fails, the others keep going. When every file has finished, the batch fires `success` — look at each upload for errors.
   *
   * `false`: the first failure stops the other files and the batch fires `error`.
   */
  continueOnError?: boolean;
}

export interface BatchHandleInit {
  id: string;
  uploads: UploadHandle[];
  options: BatchOptions;
  startNext: (handle: UploadHandle) => void;
  onChange: () => void;
}

/**
 * A group of files from {@link StorageManager.uploadFiles}. Use `.on(...)` like a single {@link UploadHandle}, plus `snapshot()` for totals.
 */
export class BatchHandle extends Emitter<BatchHandleEvents> {
  public readonly id: string;
  public readonly uploads: UploadHandle[];

  private readonly concurrency: number;
  private readonly continueOnError: boolean;
  private readonly startNext: (handle: UploadHandle) => void;
  private readonly onChange: () => void;

  private running = 0;
  private nextIdx = 0;
  /** Indices that were started via {@link fillSlots} and still hold a concurrency slot. */
  private readonly activeSlots = new Set<number>();
  private settledCount = 0;
  private succeededCount = 0;
  private failedCount = 0;
  private failedFast = false;
  private canceled = false;
  private paused = false;
  private terminalEmitted = false;

  // Stable view of UploadItems; the items themselves mutate in place, but the
  // array reference never changes, so we allocate it once instead of rebuilding
  // it on every snapshot.
  private readonly uploadsView: UploadItem[];

  // Running aggregates updated incrementally on each child event so snapshot()
  // is O(1) instead of O(n) per progress tick.
  private aggregateBytesTransferred = 0;
  private aggregateTotalBytes = 0;
  private readonly lastBytes: number[];
  private readonly lastTotal: number[];

  constructor(init: BatchHandleInit) {
    super();
    this.id = init.id;
    this.uploads = init.uploads;
    this.concurrency = Math.max(1, init.options.concurrency ?? 3);
    this.continueOnError = init.options.continueOnError ?? true;
    this.startNext = init.startNext;
    this.onChange = init.onChange;

    this.uploadsView = init.uploads.map((h) => h.upload);
    this.lastBytes = Array.from(
      { length: init.uploads.length },
      (): number => 0
    );
    this.lastTotal = Array.from(
      { length: init.uploads.length },
      (): number => 0
    );
    for (let i = 0; i < this.uploadsView.length; i += 1) {
      const u = this.uploadsView[i];
      if (!u) {
        continue;
      }
      this.lastBytes[i] = u.bytesTransferred;
      this.lastTotal[i] = u.totalBytes;
      this.aggregateBytesTransferred += u.bytesTransferred;
      this.aggregateTotalBytes += u.totalBytes;
    }

    for (let idx = 0; idx < this.uploads.length; idx += 1) {
      const child = this.uploads[idx];
      if (!child) {
        continue;
      }
      child.on("progress", (upload) => {
        this.handleChildProgress(idx, upload);
      });
      child.on("retry", (retryEvent) => {
        this.handleChildRetry(idx, retryEvent);
      });
      child.on("success", (upload) => {
        this.handleChildSettled(idx, upload, "success");
      });
      child.on("error", (upload) => {
        this.handleChildSettled(idx, upload, "error");
      });
      child.on("canceled", (upload) => {
        this.handleChildSettled(idx, upload, "canceled");
      });
    }
  }

  /** @internal */
  _start(): void {
    this.fillSlots();
  }

  cancel(): void {
    if (this.canceled || this.terminalEmitted) {
      return;
    }
    this.canceled = true;
    for (const h of this.uploads) {
      const s = h.upload.status;
      if (
        s === "queued" ||
        s === "uploading" ||
        s === "retrying" ||
        s === "paused"
      ) {
        h.cancel();
      }
    }
    this.onChange();
  }

  pause(): void {
    if (this.paused || this.canceled || this.terminalEmitted) {
      return;
    }
    this.paused = true;
    for (const h of this.uploads) {
      if (h.upload.status === "uploading" || h.upload.status === "retrying") {
        h.pause();
      }
    }
    this.onChange();
  }

  resume(): void {
    if (!this.paused || this.canceled || this.terminalEmitted) {
      return;
    }
    this.paused = false;
    for (const h of this.uploads) {
      if (h.upload.status === "paused") {
        h.resume();
      }
    }
    this.fillSlots();
    this.onChange();
  }

  snapshot(): UploadBatch {
    const totalProgress =
      this.aggregateTotalBytes > 0
        ? (this.aggregateBytesTransferred / this.aggregateTotalBytes) * 100
        : 0;
    return {
      completedCount: this.succeededCount,
      failedCount: this.failedCount,
      id: this.id,
      totalProgress,
      uploads: this.uploadsView,
    };
  }

  private updateAggregate(idx: number, u: UploadItem): void {
    const prevBytes = this.lastBytes[idx] ?? 0;
    const prevTotal = this.lastTotal[idx] ?? 0;
    this.aggregateBytesTransferred += u.bytesTransferred - prevBytes;
    this.aggregateTotalBytes += u.totalBytes - prevTotal;
    this.lastBytes[idx] = u.bytesTransferred;
    this.lastTotal[idx] = u.totalBytes;
  }

  private fillSlots(): void {
    while (
      !this.canceled &&
      !this.paused &&
      !this.failedFast &&
      this.running < this.concurrency &&
      this.nextIdx < this.uploads.length
    ) {
      const idx = this.nextIdx;
      this.nextIdx += 1;
      const handle = this.uploads[idx];
      if (!handle || handle.upload.status !== "queued") {
        continue;
      }
      this.activeSlots.add(idx);
      this.running += 1;
      this.startNext(handle);
    }
  }

  private handleChildProgress(idx: number, upload: UploadItem): void {
    this.updateAggregate(idx, upload);
    const snap = this.snapshot();
    this.emit("progress", snap);
    this.emit("change", snap);
  }

  private handleChildRetry(idx: number, event: UploadRetryEvent): void {
    this.updateAggregate(idx, event.upload);
    this.emit("uploadRetry", event);
    const snap = this.snapshot();
    this.emit("change", snap);
  }

  private handleChildSettled(
    idx: number,
    upload: UploadItem,
    kind: "success" | "error" | "canceled"
  ): void {
    this.updateAggregate(idx, upload);
    if (this.activeSlots.delete(idx)) {
      this.running = Math.max(0, this.running - 1);
    }
    this.settledCount += 1;

    if (kind === "success") {
      this.succeededCount += 1;
      this.emit("uploadSuccess", upload);
    } else if (kind === "error") {
      this.failedCount += 1;
      this.emit("uploadError", upload);
    }

    const snap = this.snapshot();
    this.emit("change", snap);

    if (
      kind === "error" &&
      !this.continueOnError &&
      !this.failedFast &&
      !this.canceled
    ) {
      this.failedFast = true;
      for (const h of this.uploads) {
        if (h.upload.id === upload.id) {
          continue;
        }
        const s = h.upload.status;
        if (
          s === "queued" ||
          s === "uploading" ||
          s === "retrying" ||
          s === "paused"
        ) {
          h.cancel();
        }
      }
      this.terminalEmitted = true;
      this.emit("error", snap);
      this.onChange();
      return;
    }

    if (this.failedFast || this.canceled) {
      // we call this because a task can canceled as seen above
      // by h.cancel(). Which then triggers the handelchildSettled call above.
      this.onChange();
      return;
    }

    this.fillSlots();

    if (this.settledCount >= this.uploads.length && !this.terminalEmitted) {
      this.terminalEmitted = true;
      this.emit("success", snap);
    }

    this.onChange();
  }
}
