---
"firebase-storage-kit": minor
---

Add automatic upload retries with exponential backoff and jitter. Uploads retry transient failures by default (3 retries); pass `retry: false` to disable or customize via `retry: { maxRetries, initialDelayMs, maxDelayMs, jitter, isRetryable }`. Upload handles emit a `retry` event, and upload status now includes `retrying`.
