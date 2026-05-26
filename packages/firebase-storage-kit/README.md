# firebase-storage-kit

Storage manager for Firebase Storage with uploads, progress tracking, batch uploads, and file query helpers.

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
import { StorageManager } from "firebase-storage-kit";

const storage = getStorage(app);
const manager = new StorageManager(storage);

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

### Upload retries

Uploads retry transient failures automatically (3 retries by default, exponential backoff with jitter). Pass `retry: false` to disable, or customize:

```ts
const handle = manager.uploadFile(file, {
  path: `uploads/${file.name}`,
  retry: { maxRetries: 5, initialDelayMs: 700 },
});

handle.on("retry", ({ attempt, maxAttempts, delayMs, error }) => {
  console.log(`Retry ${attempt}/${maxAttempts} in ${delayMs}ms`, error.message);
});
```

### Querying files

```ts
const exists = await manager.exists("uploads/photo.jpg");

if (exists) {
  const meta = await manager.getMetadata("uploads/photo.jpg");
  const url = await manager.getDownloadURL("uploads/photo.jpg");
  console.log(meta.size, url);
}

await manager.delete("uploads/old.jpg");
```

`exists` returns `false` only when the object is not found. Permission and network errors are thrown.

## License

MIT
