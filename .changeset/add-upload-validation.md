---
"firebase-storage-kit": minor
---

Add optional pre-upload validation via `UploadOptions.validate`. Reject files before the provider upload starts using `maxSizeBytes`, `allowedMimeTypes`, `allowedExtensions`, and optional image dimension limits (`maxImageWidth`, `maxImageHeight`). Validation failures surface as `ValidationError` with stable `validation/*` codes on `error.code` (for example `validation/file-too-large`). Export `validateUpload`, `validateUploadSync`, `validateImageDimensions`, `validateImageDimensionLimits`, `readImageDimensions`, `getFileExtension`, `VALIDATION_ERROR_CODES`, and the `ValidationErrorCode` type for standalone use.
