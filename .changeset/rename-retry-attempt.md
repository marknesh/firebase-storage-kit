---
"firebase-storage-kit": minor
---

Add `UploadItem.attempt` as the preferred name for the 1-based attempt counter (the initial upload is attempt `1`, and each retry increments it). `UploadItem.retryAttempt` is now deprecated but continues to work as an alias that always mirrors `attempt`, so this change is non-breaking. Prefer `upload.attempt` going forward.
