# firebase-storage-kit

## 1.4.0

### Minor Changes

- [#32](https://github.com/marknesh/firebase-storage-kit/pull/32) [`b3fcd05`](https://github.com/marknesh/firebase-storage-kit/commit/b3fcd05181bbd735617037ded89791827cac9e74) Thanks [@marknesh](https://github.com/marknesh)! - Add React hooks via `firebase-storage-kit/react`: `useStorageManager`, `useStorageState`, `useUpload`, `useBatch`, and optional `StorageManagerProvider`. React is an optional peer dependency.

## 1.3.0

### Minor Changes

- [#25](https://github.com/marknesh/firebase-storage-kit/pull/25) [`0d797dc`](https://github.com/marknesh/firebase-storage-kit/commit/0d797dc3429eaedb83d40e5ac6b7fc1be41bbc5a) Thanks [@marknesh](https://github.com/marknesh)! - Add optional `customMetadata` to `UploadOptions` for setting Firebase Storage custom metadata at upload time.

## 1.2.1

### Patch Changes

- [#23](https://github.com/marknesh/firebase-storage-kit/pull/23) [`4f01202`](https://github.com/marknesh/firebase-storage-kit/commit/4f01202090b77c93bf36219b66026d0181bd19b8) Thanks [@marknesh](https://github.com/marknesh)! - Add `uploadRetry` event to `BatchHandle`, forwarding child upload retry events with the same `UploadRetryEvent` payload as single-file `UploadHandle` `retry`.

## 1.2.0

### Minor Changes

- [#20](https://github.com/marknesh/firebase-storage-kit/pull/20) [`2f8188c`](https://github.com/marknesh/firebase-storage-kit/commit/2f8188c23b295c671ed0c5233a3df617db7afdf0) Thanks [@marknesh](https://github.com/marknesh)! - Add automatic upload retries with exponential backoff and jitter. Uploads retry transient failures by default (3 retries); pass `retry: false` to disable or customize via `retry: { maxRetries, initialDelayMs, maxDelayMs, jitter, isRetryable }`. Upload handles emit a `retry` event, and upload status now includes `retrying`.

## 1.1.1

### Patch Changes

- [#13](https://github.com/marknesh/firebase-storage-kit/pull/13) [`59abfa2`](https://github.com/marknesh/firebase-storage-kit/commit/59abfa28e47bcac7c3773c59dcf7c54c07998626) Thanks [@marknesh](https://github.com/marknesh)! - Fix batch uploads getting stuck in `uploading` when queued items are canceled. The scheduler now skips non-queued uploads instead of restarting them, and only releases concurrency slots for uploads that were actually started.

## 1.1.0

### Minor Changes

- [#9](https://github.com/marknesh/firebase-storage-kit/pull/9) [`c27fe73`](https://github.com/marknesh/firebase-storage-kit/commit/c27fe737d5d98152e9fe960c6fa7932b4d1efa5f) Thanks [@marknesh](https://github.com/marknesh)! - Simplify setup: `StorageManager` now accepts a `FirebaseStorage` instance from `getStorage()` instead of a `StorageProvider`. Removed the `firebase-storage-kit/firebase` export; import everything from `firebase-storage-kit`.

## 1.0.0

### Major Changes

- [#7](https://github.com/marknesh/firebase-storage-kit/pull/7) [`7ba57fb`](https://github.com/marknesh/firebase-storage-kit/commit/7ba57fb47d84f7424e84fb0d37af7db5b054f8ac) Thanks [@marknesh](https://github.com/marknesh)! - Rename `UploadManager` to `StorageManager` and `UploadState` to `StorageState`. Add `exists`, `getMetadata`, `getDownloadURL`, and `delete` on `StorageManager` and `StorageProvider`.

## 0.0.3

### Patch Changes

- [#2](https://github.com/marknesh/firebase-storage-kit/pull/2) [`f5c6c3d`](https://github.com/marknesh/firebase-storage-kit/commit/f5c6c3d36a0957ecec902ef2a7a3cfd9f1d9b287) Thanks [@marknesh](https://github.com/marknesh)! - added changeset and workflows
