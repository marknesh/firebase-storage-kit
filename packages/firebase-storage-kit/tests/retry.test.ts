import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

import { StorageManager } from "../src/core/storage-manager";
import {
  computeRetryDelay,
  isRetryableStorageError,
  resolveRetryOptions,
} from "../src/core/retry";
import {
  createMockProvider,
  waitForMicrotasks,
} from "./helpers/mock-provider";
import { createTestFile } from "./helpers/test-file";

function storageError(code: string, message = code): Error {
  return Object.assign(new Error(message), { code });
}

describe("retry utilities", () => {
  it("resolveRetryOptions returns defaults when omitted", () => {
    const resolved = resolveRetryOptions();
    expect(resolved?.maxRetries).toBe(3);
    expect(resolved?.initialDelayMs).toBe(1000);
    expect(resolved?.jitter).toBe(true);
  });

  it("resolveRetryOptions returns null when disabled", () => {
    expect(resolveRetryOptions(false)).toBeNull();
  });

  it("classifies Firebase retryable and non-retryable errors", () => {
    const options = resolveRetryOptions();
    expect(
      isRetryableStorageError(
        storageError("storage/retry-limit-exceeded"),
        options,
      ),
    ).toBe(true);
    expect(
      isRetryableStorageError(storageError("storage/unauthorized"), options),
    ).toBe(false);
    expect(isRetryableStorageError(new Error("network"), options)).toBe(true);
  });

  it("computeRetryDelay respects jitter setting", () => {
    const withJitter = computeRetryDelay(2, {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      jitter: true,
    });
    const withoutJitter = computeRetryDelay(2, {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      jitter: false,
    });

    expect(withJitter).toBeGreaterThanOrEqual(1000);
    expect(withJitter).toBeLessThanOrEqual(2000);
    expect(withoutJitter).toBe(2000);
  });
});

describe("upload retries", () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  it("succeeds after transient failures with default retries", async () => {
    const { provider, spies } = createMockProvider({
      uploadBehavior: {
        type: "failThenSucceed",
        failures: 2,
        error: storageError("storage/retry-limit-exceeded"),
        async: true,
      },
    });
    const manager = new StorageManager(provider);
    const handle = manager.uploadFile(createTestFile("photo.jpg"), {
      path: "uploads/photo.jpg",
      retry: { initialDelayMs: 10, maxDelayMs: 10, jitter: false },
    });

    await waitForMicrotasks();
    await waitForMicrotasks();
    expect(handle.upload.status).toBe("retrying");

    await new Promise((resolve) => setTimeout(resolve, 30));
    await waitForMicrotasks();

    expect(spies.upload).toHaveBeenCalledTimes(3);
    expect(handle.upload.status).toBe("success");
    expect(handle.upload.retryAttempt).toBe(3);
  });

  it("fails immediately on non-retryable errors", async () => {
    const { provider, spies } = createMockProvider({
      uploadBehavior: {
        type: "error",
        error: storageError("storage/unauthorized"),
        async: true,
      },
    });
    const manager = new StorageManager(provider);
    const handle = manager.uploadFile(createTestFile("photo.jpg"), {
      path: "uploads/photo.jpg",
    });

    await waitForMicrotasks();
    await waitForMicrotasks();

    expect(spies.upload).toHaveBeenCalledTimes(1);
    expect(handle.upload.status).toBe("error");
  });

  it("does not retry when retry is false", async () => {
    const { provider, spies } = createMockProvider({
      uploadBehavior: {
        type: "error",
        error: storageError("storage/retry-limit-exceeded"),
        async: true,
      },
    });
    const manager = new StorageManager(provider);
    const handle = manager.uploadFile(createTestFile("photo.jpg"), {
      path: "uploads/photo.jpg",
      retry: false,
    });

    await waitForMicrotasks();
    await waitForMicrotasks();

    expect(spies.upload).toHaveBeenCalledTimes(1);
    expect(handle.upload.status).toBe("error");
  });

  it("emits retry event with attempt metadata", async () => {
    const { provider } = createMockProvider({
      uploadBehavior: {
        type: "failThenSucceed",
        failures: 1,
        error: storageError("storage/unknown"),
        async: true,
      },
    });
    const manager = new StorageManager(provider);
    const onRetry = mock(() => {});
    const handle = manager.uploadFile(createTestFile("photo.jpg"), {
      path: "uploads/photo.jpg",
      retry: { maxRetries: 2, initialDelayMs: 10, jitter: false },
    });

    handle.on("retry", onRetry);
    await waitForMicrotasks();
    await waitForMicrotasks();

    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 2,
        maxAttempts: 3,
        delayMs: 10,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    await waitForMicrotasks();

    expect(handle.upload.status).toBe("success");
  });

  it("cancel during backoff aborts without final error", async () => {
    const { provider, spies } = createMockProvider({
      uploadBehavior: {
        type: "failThenSucceed",
        failures: 5,
        error: storageError("storage/retry-limit-exceeded"),
        async: true,
      },
    });
    const manager = new StorageManager(provider);
    const onError = mock(() => {});
    const handle = manager.uploadFile(createTestFile("photo.jpg"), {
      path: "uploads/photo.jpg",
      retry: { initialDelayMs: 100, jitter: false },
    });

    handle.on("error", onError);
    await waitForMicrotasks();
    await waitForMicrotasks();

    handle.cancel();
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(handle.upload.status).toBe("canceled");
    expect(onError).not.toHaveBeenCalled();
    expect(spies.upload).toHaveBeenCalledTimes(1);
  });

  it("pause during backoff delays retry until resume", async () => {
    const { provider, spies } = createMockProvider({
      uploadBehavior: {
        type: "failThenSucceed",
        failures: 1,
        error: storageError("storage/retry-limit-exceeded"),
        async: true,
      },
    });
    const manager = new StorageManager(provider);
    const handle = manager.uploadFile(createTestFile("photo.jpg"), {
      path: "uploads/photo.jpg",
      retry: { initialDelayMs: 50, jitter: false },
    });

    await waitForMicrotasks();
    await waitForMicrotasks();
    expect(handle.upload.status).toBe("retrying");

    handle.pause();
    expect(handle.upload.status).toBe("paused");

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(spies.upload).toHaveBeenCalledTimes(1);

    handle.resume();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await waitForMicrotasks();

    expect(spies.upload).toHaveBeenCalledTimes(2);
    expect(handle.upload.status).toBe("success");
  });

  it("preserves per-file retry options in batch uploads", async () => {
    const { provider, spies } = createMockProvider({
      uploadBehavior: {
        type: "failThenSucceed",
        failures: 1,
        error: storageError("storage/retry-limit-exceeded"),
        async: true,
      },
    });
    const manager = new StorageManager(provider);
    const file = createTestFile("a.txt");

    const batch = manager.uploadFiles(
      [file],
      () => ({
        path: "uploads/a.txt",
        retry: { maxRetries: 1, initialDelayMs: 10, jitter: false },
      }),
      { concurrency: 1 },
    );

    await waitForMicrotasks();
    await waitForMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await waitForMicrotasks();

    expect(spies.upload).toHaveBeenCalledTimes(2);
    expect(batch.snapshot().completedCount).toBe(1);
  });
});
