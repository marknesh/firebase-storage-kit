import {
  deleteObject,
  getDownloadURL,
  getMetadata,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import type { FirebaseStorage, StorageError } from "firebase/storage";

import type { FileMetadata } from "../types/metadata";
import type {
  ProviderUploadCallbacks,
  ProviderUploadTask,
  UploadOptions,
} from "../types/provider";
import type { StorageProvider } from "./provider";

const isStorageError = (error: unknown): error is StorageError =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code: unknown }).code === "string";

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

export class FirebaseStorageProvider implements StorageProvider {
  private readonly storage: FirebaseStorage;

  constructor(storage: FirebaseStorage) {
    this.storage = storage;
  }

  upload(
    file: File,
    options: UploadOptions,
    callbacks: ProviderUploadCallbacks
  ): ProviderUploadTask {
    const storageRef = ref(this.storage, options.path);

    const metadata =
      options.contentType !== undefined || options.customMetadata !== undefined
        ? {
            ...(options.contentType !== undefined && {
              contentType: options.contentType,
            }),
            ...(options.customMetadata !== undefined && {
              customMetadata: options.customMetadata,
            }),
          }
        : undefined;

    const task = uploadBytesResumable(storageRef, file, metadata);

    task.on(
      "state_changed",
      (snapshot) => {
        callbacks.onProgress(snapshot.bytesTransferred, snapshot.totalBytes);
      },
      (error) => {
        callbacks.onError(error);
      },
      () => {
        void (async () => {
          try {
            const downloadURL = await getDownloadURL(storageRef);
            callbacks.onSuccess(downloadURL);
          } catch (error) {
            callbacks.onError(toError(error));
          }
        })();
      }
    );

    return {
      cancel: () => {
        task.cancel();
      },
      pause: () => {
        task.pause();
      },
      resume: () => {
        task.resume();
      },
    };
  }

  async exists(path: string): Promise<boolean> {
    try {
      await getMetadata(ref(this.storage, path));
      return true;
    } catch (error) {
      if (isStorageError(error) && error.code === "storage/object-not-found") {
        return false;
      }
      throw error;
    }
  }

  async getMetadata(path: string): Promise<FileMetadata> {
    const meta = await getMetadata(ref(this.storage, path));
    return {
      contentType: meta.contentType,
      createdAt: new Date(meta.timeCreated),
      customMetadata: meta.customMetadata,
      path,
      size: meta.size,
      updatedAt: new Date(meta.updated),
    };
  }

  async getDownloadURL(path: string): Promise<string> {
    return await getDownloadURL(ref(this.storage, path));
  }

  async delete(path: string): Promise<void> {
    await deleteObject(ref(this.storage, path));
  }
}
