import type { ListOptions, StorageListResult } from "../types/list";
import type { FileMetadata } from "../types/metadata";
import type {
  ProviderUploadCallbacks,
  ProviderUploadTask,
  UploadOptions,
} from "../types/provider";

export interface StorageProvider {
  upload(
    file: File,

    options: UploadOptions,

    callbacks: ProviderUploadCallbacks
  ): ProviderUploadTask;

  exists(path: string): Promise<boolean>;

  getMetadata(path: string): Promise<FileMetadata>;

  getDownloadURL(path: string): Promise<string>;

  delete(path: string): Promise<void>;

  list(prefix: string, options?: ListOptions): Promise<StorageListResult>;

  listAll(prefix: string): Promise<StorageListResult>;
}
