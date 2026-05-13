import type {
  ProviderUploadCallbacks,
  ProviderUploadTask,
  UploadOptions,
} from "../types/provider";

export interface StorageProvider {
  upload(
    file: File,

    options: UploadOptions,

    callbacks: ProviderUploadCallbacks,
  ): ProviderUploadTask;
}
