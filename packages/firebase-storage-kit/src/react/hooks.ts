import type { FirebaseStorage } from "firebase/storage";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

const selectWholeState = (state: StorageState): StorageState => state;

/**
 * `useSyncExternalStore` re-renders whenever `getSnapshot` returns a different value (`Object.is`).
 * This `getSnapshot` hands back the last rendered selection when `isEqual` says the new one is the
 * same, so unrelated changes (like progress ticks) don't re-render the component.
 */
const useSelectedStorageState = <T>(
  manager: StorageManager,
  selector: (state: StorageState) => T,
  isEqual: (previous: T, next: T) => boolean = Object.is
): T => {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      subscribeToStorageManager(manager, onStoreChange),
    [manager]
  );

  // The selection React last rendered. Wrapped so `undefined` can be a real selected value.
  const renderedRef = useRef<{ value: T } | null>(null);

  const getSelection = useMemo(() => {
    // React calls getSnapshot several times per render and expects the same value back while the
    // store is unchanged, so remember the result for the last state seen.
    let last: { state: StorageState; selection: T } | null = null;
    return (): T => {
      const state = getStorageManagerSnapshot(manager);
      if (last !== null && last.state === state) {
        return last.selection;
      }
      const next = selector(state);
      const rendered = renderedRef.current;
      const selection =
        rendered !== null && isEqual(rendered.value, next)
          ? rendered.value
          : next;
      last = { selection, state };
      return selection;
    };
  }, [manager, selector, isEqual]);

  const getServerSelection = useMemo(() => {
    let cached: { value: T } | null = null;
    return (): T => {
      cached ??= { value: selector(emptyStorageState) };
      return cached.value;
    };
  }, [selector]);

  const selection = useSyncExternalStore(
    subscribe,
    getSelection,
    getServerSelection
  );

  useEffect(() => {
    renderedRef.current = { value: selection };
  }, [selection]);

  return selection;
};

/**
 * Creates one {@link StorageManager} per `storage` instance (stable while `storage` is unchanged).
 */
export const useStorageManager = (storage: FirebaseStorage): StorageManager =>
  useMemo(() => new StorageManager(storage), [storage]);

/** Second argument of {@link useStorageState} when you pass a selector. */
export interface StorageStateSelectorOptions<T> {
  /** Manager to read from. Defaults to the one from {@link StorageManagerProvider}. */
  manager?: StorageManager;
  /**
   * Returns `true` when two selections count as the same, so the component skips the re-render.
   * Defaults to `Object.is`. Pass one when your selector builds a new array or object each time.
   */
  isEqual?: (previous: T, next: T) => boolean;
}

/**
 * Subscribes to {@link StorageManager.getState}. Pass a manager or use inside
 * {@link StorageManagerProvider} with no argument. Re-renders on every change, including each
 * progress tick of every upload.
 */
export function useStorageState(manager?: StorageManager): StorageState;
/**
 * Subscribes to the part of {@link StorageManager.getState} that `selector` returns, and re-renders
 * only when that value changes: `useStorageState((s) => s.batches.length)`.
 */
export function useStorageState<T>(
  selector: (state: StorageState) => T,
  options?: StorageStateSelectorOptions<T>
): T;
export function useStorageState<T>(
  managerOrSelector?: StorageManager | ((state: StorageState) => T),
  options: StorageStateSelectorOptions<StorageState | T> = {}
): StorageState | T {
  const hasSelector = typeof managerOrSelector === "function";
  const contextManager = useContext(StorageManagerContext) ?? undefined;
  const resolved =
    (hasSelector ? options.manager : managerOrSelector) ?? contextManager;
  if (resolved === undefined) {
    throw new Error(
      "useStorageState requires a StorageManager argument or StorageManagerProvider"
    );
  }

  return useSelectedStorageState<StorageState | T>(
    resolved,
    hasSelector ? managerOrSelector : selectWholeState,
    hasSelector ? options.isEqual : undefined
  );
}

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
