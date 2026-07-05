# firebase-storage-kit

[![Socket Badge](https://socket.dev/api/badge/npm/package/firebase-storage-kit)](https://socket.dev/npm/package/firebase-storage-kit)

Upload files to Firebase Storage with automatic retries, batch uploads, and pre-upload validation.

**Full documentation:** [firebase-storage-kit.vercel.app/docs](https://firebase-storage-kit.vercel.app/docs)

## Install

```bash
npm install firebase firebase-storage-kit
```

Also works with Yarn, pnpm, or Bun. See [Installation](https://firebase-storage-kit.vercel.app/docs/getting-started/installation) for all package managers.

## Quick start

```ts
import { getStorage } from "firebase/storage";
import { StorageManager } from "firebase-storage-kit";

const storage = getStorage(app);
const manager = new StorageManager(storage);

const handle = manager.uploadFile(file, {
  path: `uploads/${file.name}`,
  validate: {
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
  },
  retry: { maxRetries: 3 },
});

handle.on("progress", (upload) => {
  console.log(upload.progress);
});

handle.on("retry", ({ attempt, maxAttempts, delayMs }) => {
  console.log(`Retry ${attempt}/${maxAttempts} in ${delayMs}ms`);
});

handle.on("success", (upload) => {
  console.log(upload.downloadURL);
});

handle.on("error", (upload) => {
  if (upload.error?.name === "ValidationError") {
    console.error("Invalid file:", upload.error.message);
    return;
  }
  console.error("Upload failed:", upload.error?.message);
});
```

### React

```tsx
import { useStorageManager, useUpload } from "firebase-storage-kit/react";

const manager = useStorageManager(storage);
const handle = manager.uploadFile(file, {
  path: `uploads/${file.name}`,
  validate: {
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
  },
  retry: { maxRetries: 3 },
});
const upload = useUpload(handle);
```

See [React hooks](https://firebase-storage-kit.vercel.app/docs/guides/react-hooks).

## Learn more

- [Single upload](https://firebase-storage-kit.vercel.app/docs/getting-started/single-upload)
- [Retries](https://firebase-storage-kit.vercel.app/docs/guides/retries)
- [Batch uploads](https://firebase-storage-kit.vercel.app/docs/guides/batch-uploads)
- [API reference](https://firebase-storage-kit.vercel.app/docs/api/storage-manager)
- [Troubleshooting](https://firebase-storage-kit.vercel.app/docs/troubleshooting)

## License

MIT