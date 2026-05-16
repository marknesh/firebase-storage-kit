# firebase-storage-kit

Upload manager for Firebase Storage with progress, cancellation, batch uploads, and configurable concurrency.

## Install

With npm:

```bash
npm install firebase-storage-kit
```

Or with Yarn, pnpm, or Bun:

```bash
yarn add firebase-storage-kit
pnpm add firebase-storage-kit
bun add firebase-storage-kit
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

## License

MIT
