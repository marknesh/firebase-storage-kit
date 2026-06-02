import type { FirebaseStorage } from "firebase/storage";
import {
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import type { BatchHandle } from "../core/batch-handle";
import type { UploadHandle } from "../core/upload-handle";
import { StorageManager } from "../firebase-storage-manager";
import type { StorageState, UploadBatch, UploadItem } from "../types/upload";
import { StorageManagerContext } from "./context";
import {
  getBatchHandleSnapshot,
  getStorageManagerSnapshot,
  getUploadHandleSnapshot,
  subscribeToBatchHandle,
  subscribeToStorageManager,
  subscribeToUploadHandle,
} from "./subscribe";

const emptyStorageState: StorageState = { batches: [], uploads: [] };

/**
 * Creates one {@link StorageManager} per `storage` instance (stable while `storage` is unchanged).
 */
export const useStorageManager = (storage: FirebaseStorage): StorageManager =>
  useMemo(() => new StorageManager(storage), [storage]);

/**
 * Subscribes to {@link StorageManager.getState}. Pass a manager or use inside
 * {@link StorageManagerProvider} with no argument.
 */
export const useStorageState = (manager?: StorageManager): StorageState => {
  const contextManager = useContext(StorageManagerContext) ?? undefined;
  const resolved = manager ?? contextManager;
  if (resolved === undefined) {
    throw new Error(
      "useStorageState requires a StorageManager argument or StorageManagerProvider"
    );
  }

  return useSyncExternalStore(
    (onStoreChange) => subscribeToStorageManager(resolved, onStoreChange),
    () => getStorageManagerSnapshot(resolved),
    () => emptyStorageState
  );
};

/** Re-renders when the {@link UploadHandle} upload item changes. */
export const useUpload = (handle: UploadHandle | null): UploadItem | null => {
  const [upload, setUpload] = useState<UploadItem | null>(() =>
    handle === null ? null : getUploadHandleSnapshot(handle)
  );

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (handle === null) {
      setUpload(null);
    } else {
      const sync = (): void => {
        setUpload(getUploadHandleSnapshot(handle));
      };
      sync();
      unsubscribe = subscribeToUploadHandle(handle, sync);
    }

    return unsubscribe;
  }, [handle]);

  return upload;
};

/** Re-renders when the {@link BatchHandle} snapshot changes. */
export const useBatch = (batch: BatchHandle | null): UploadBatch | null => {
  const [snapshot, setSnapshot] = useState<UploadBatch | null>(() =>
    batch === null ? null : getBatchHandleSnapshot(batch)
  );

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (batch === null) {
      setSnapshot(null);
    } else {
      const sync = (): void => {
        setSnapshot(getBatchHandleSnapshot(batch));
      };
      sync();
      unsubscribe = subscribeToBatchHandle(batch, sync);
    }

    return unsubscribe;
  }, [batch]);

  return snapshot;
};
