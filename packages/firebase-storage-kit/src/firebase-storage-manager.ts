import type { FirebaseStorage } from "firebase/storage";

import { StorageManager as BaseStorageManager } from "./core/storage-manager";
import { FirebaseStorageProvider } from "./providers/firebase-provider";

/** Firebase Storage uploads and file helpers. Pass a `FirebaseStorage` instance from `getStorage(app)`. */
export class StorageManager extends BaseStorageManager {
  constructor(storage: FirebaseStorage) {
    super(new FirebaseStorageProvider(storage));
  }
}
