---
"firebase-storage-kit": patch
---

Add `uploadRetry` event to `BatchHandle`, forwarding child upload retry events with the same `UploadRetryEvent` payload as single-file `UploadHandle` `retry`.
