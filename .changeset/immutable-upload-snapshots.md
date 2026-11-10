---
"firebase-storage-kit": patch
---

Fix memoized React components not updating during uploads. `UploadItem` snapshots are now replaced with a new object on every change instead of being mutated in place, so `React.memo`, `useMemo` deps and `prev !== next` checks see progress, status and errors. `batch.snapshot().uploads` returns a new array only when a file in the batch changed.

`UploadItem` fields are now `readonly`. If you stored `handle.upload` and read it later, read `handle.upload` again, listen to the events, or use the `useUpload(handle)` / `useBatch(batch)` hooks in React to get the latest values.
