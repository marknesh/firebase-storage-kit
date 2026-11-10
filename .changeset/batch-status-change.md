---
"firebase-storage-kit": patch
---

Fix `useBatch` not updating when a batch is paused or resumed. A batch now emits `change` whenever one of its files is paused or resumed, whether through `batch.pause()` / `batch.resume()` or by calling `pause()` / `resume()` on a single file, so `batch.on("change", ...)` and `useBatch(batch)` show the new statuses.
