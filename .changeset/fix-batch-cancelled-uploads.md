---
"firebase-storage-kit": patch
---

Fix batch uploads getting stuck in `uploading` when queued items are canceled. The scheduler now skips non-queued uploads instead of restarting them, and only releases concurrency slots for uploads that were actually started.
