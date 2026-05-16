import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type FirebaseStorage,
} from "firebase/storage";

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
}
