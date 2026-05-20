import type {
  ProviderUploadCallbacks,
  ProviderUploadTask,
  UploadOptions,
} from "../types/provider";
import type { FileMetadata } from "../types/metadata";

export interface StorageProvider {
  upload(
    file: File,

    options: UploadOptions,

    callbacks: ProviderUploadCallbacks,
  ): ProviderUploadTask;

  exists(path: string): Promise<boolean>;

  getMetadata(path: string): Promise<FileMetadata>;

  getDownloadURL(path: string): Promise<string>;

  delete(path: string): Promise<void>;
}
