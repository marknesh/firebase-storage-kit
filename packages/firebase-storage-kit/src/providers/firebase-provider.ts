import {
  deleteObject,
  getDownloadURL,
  getMetadata,
  ref,
  uploadBytesResumable,
  type FirebaseStorage,
  type StorageError,
} from "firebase/storage";

import type { FileMetadata } from "../types/metadata";
import type {
  ProviderUploadCallbacks,
  ProviderUploadTask,
  UploadOptions,
} from "../types/provider";
import type { StorageProvider } from "./provider";

export class FirebaseStorageProvider implements StorageProvider {
  constructor(private storage: FirebaseStorage) {}

  upload(
    file: File,

    options: UploadOptions,

    callbacks: ProviderUploadCallbacks,
  ): ProviderUploadTask {
    const storageRef = ref(this.storage, options.path);

    const task = uploadBytesResumable(storageRef, file);

    task.on(
      "state_changed",

      (snapshot) => {
        callbacks.onProgress(
          snapshot.bytesTransferred,

          snapshot.totalBytes,
        );
      },

      (error) => {
        callbacks.onError(error);
      },

      async () => {
        try {
          const downloadURL = await getDownloadURL(storageRef);

          callbacks.onSuccess(downloadURL);
        } catch (error) {
          callbacks.onError(error as Error);
        }
      },
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
    } catch (err) {
      if ((err as StorageError).code === "storage/object-not-found") {
        return false;
      }
      throw err;
    }
  }

  async getMetadata(path: string): Promise<FileMetadata> {
    const meta = await getMetadata(ref(this.storage, path));
    return {
      path,
      size: meta.size,
      contentType: meta.contentType,
      createdAt: new Date(meta.timeCreated),
      updatedAt: new Date(meta.updated),
      customMetadata: meta.customMetadata,
    };
  }

  getDownloadURL(path: string): Promise<string> {
    return getDownloadURL(ref(this.storage, path));
  }

  async delete(path: string): Promise<void> {
    await deleteObject(ref(this.storage, path));
  }
}
