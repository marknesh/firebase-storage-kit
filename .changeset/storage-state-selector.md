---
"firebase-storage-kit": patch
---

Reduce re-renders from `useStorageState`. Pass a selector, `useStorageState((state) => state.batches.length)`, and the component re-renders only when the selected value changes instead of on every progress update. Use the `isEqual` option when the selector returns a new array or object, and the `manager` option outside a `StorageManagerProvider`. Calls without a selector work as before.

`useStorageState` also no longer re-subscribes on every render, and the manager now notifies `subscribe` listeners once instead of twice when a file in a batch finishes.
