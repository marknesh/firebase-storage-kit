import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { StorageManager } from "../firebase-storage-manager";

export const StorageManagerContext = createContext<StorageManager | null>(null);

export interface StorageManagerProviderProps {
  manager: StorageManager;
  children: ReactNode;
}

/** Supplies a {@link StorageManager} to hooks that read from context. */
export const StorageManagerProvider = ({
  manager,
  children,
}: StorageManagerProviderProps) => (
  <StorageManagerContext.Provider value={manager}>
    {children}
  </StorageManagerContext.Provider>
);

/** Returns the manager from the nearest {@link StorageManagerProvider}. */
export const useStorageManagerContext = (): StorageManager => {
  const manager = useContext(StorageManagerContext);
  if (manager === null) {
    throw new Error(
      "useStorageManagerContext must be used within a StorageManagerProvider"
    );
  }
  return manager;
};
