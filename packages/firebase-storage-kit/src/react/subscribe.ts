import type { BatchHandle } from "../core/batch-handle";
import type { StorageManager } from "../core/storage-manager";
import type { UploadHandle } from "../core/upload-handle";
import type { StorageState, UploadBatch, UploadItem } from "../types/upload";

const uploadHandleEvents = [
  "progress",
  "statusChange",
  "success",
  "error",
  "canceled",
  "retry",
] as const;

const batchHandleEvents = ["change", "progress", "success", "error"] as const;

/** @internal */
export const subscribeToStorageManager = (
  manager: StorageManager,
  onStoreChange: () => void
): (() => void) => manager.subscribe(onStoreChange);

/** @internal */
export const getStorageManagerSnapshot = (
  manager: StorageManager
): StorageState => manager.getState();

/** @internal */
export const subscribeToUploadHandle = (
  handle: UploadHandle,
  onStoreChange: () => void
): (() => void) => {
  const unsubs = uploadHandleEvents.map((event) =>
    handle.on(event, onStoreChange)
  );
  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
};

/** @internal */
export const getUploadHandleSnapshot = (handle: UploadHandle): UploadItem => ({
  ...handle.upload,
});

/** @internal */
export const subscribeToBatchHandle = (
  batch: BatchHandle,
  onStoreChange: () => void
): (() => void) => {
  const unsubs = batchHandleEvents.map((event) =>
    batch.on(event, onStoreChange)
  );
  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
};

/** @internal */
export const getBatchHandleSnapshot = (batch: BatchHandle): UploadBatch =>
  batch.snapshot();
