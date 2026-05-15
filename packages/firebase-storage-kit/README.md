# firebase-storage-kit

If you've built a file picker on top of Firebase Storage, you've probably wired the same things again: progress updates, error handling, cancellation, and some limit on parallel uploads when someone selects a whole folder. This library is a thin layer for that, a single upload manager with progress updates and batched uploads with configurable concurrency.

## Install

```bash
npm install firebase-storage-kit
```

## Quick start

```ts
import { getStorage } from "firebase/storage";
import { UploadManager } from "firebase-storage-kit";
import { FirebaseStorageProvider } from "firebase-storage-kit/firebase";

const storage = getStorage(app);
const manager = new UploadManager(new FirebaseStorageProvider(storage));

const handle = manager.uploadFile(file, { path: `uploads/${file.name}` });

handle.on("progress", (upload) => {
  console.log(upload.progress);
});

handle.on("success", (upload) => {
  console.log(upload.downloadURL);
});
```

### Batch uploads

```ts
const batch = manager.uploadFiles(
  files,
  (file) => ({ path: `uploads/${file.name}` }),
  { concurrency: 3, continueOnError: true },
);

batch.on("success", (snapshot) => {
  console.log(snapshot.completedCount, snapshot.failedCount);
});
```

### Subscriptions (manager state)

```ts
const unsubscribe = manager.subscribe((state) => {
  console.log(state.uploads, state.batches);
});
```

## Entry points

| Import                          | Use                                                   |
| ------------------------------- | ----------------------------------------------------- |
| `firebase-storage-kit`          | `UploadManager`, `UploadHandle`, `BatchHandle`, types |
| `firebase-storage-kit/firebase` | `FirebaseStorageProvider`                             |

## License

MIT
