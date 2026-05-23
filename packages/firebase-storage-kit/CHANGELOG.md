# firebase-storage-kit

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
