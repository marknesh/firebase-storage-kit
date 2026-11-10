import { describe, expect, it, mock } from "bun:test";

import { StorageManager } from "../src/core/storage-manager";
import {
  createMockProvider,
  delay,
  waitForMicrotasks,
  waitForUploadSettled,
} from "./helpers/mock-provider";
import { createTestFile } from "./helpers/test-file";

const waitForBatchTerminal = async (
  batch: ReturnType<StorageManager["uploadFiles"]>,
  timeoutMs = 3000
): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const terminal = batch.uploads.every((handle) => {
      const { status } = handle.upload;
      return (
        status === "success" || status === "error" || status === "canceled"
      );
    });
    if (terminal) {
      return;
    }
    await delay(10);
  }
  throw new Error("batch did not finish in time");
};

// Two files that start uploading and never finish, plus the statuses seen on each batch `change`.
const startManualBatch = () => {
  const { provider } = createMockProvider({
    uploadBehavior: { onStart: () => {}, type: "manual" },
  });
  const manager = new StorageManager(provider);
  const batch = manager.uploadFiles(
    [createTestFile("a.txt"), createTestFile("b.txt")],
    (file) => ({ path: `uploads/${file.name}` }),
    { concurrency: 2 }
  );
  const statuses: string[][] = [];
  batch.on("change", (snap) => {
    statuses.push(snap.uploads.map((u) => u.status));
  });
  return { batch, statuses };
};

describe("BatchHandle via StorageManager.uploadFiles", () => {
  it("snapshot().uploads changes reference only when a child upload changes", async () => {
    const progressCallbacks: ((sent: number, total: number) => void)[] = [];
    const { provider } = createMockProvider({
      uploadBehavior: {
        onStart: (_file, _options, callbacks) => {
          progressCallbacks.push(callbacks.onProgress);
        },
        type: "manual",
      },
    });
    const manager = new StorageManager(provider);
    const batch = manager.uploadFiles(
      [createTestFile("a.txt"), createTestFile("b.txt")],
      (file) => ({ path: `uploads/${file.name}` }),
      { concurrency: 2 }
    );
    await waitForMicrotasks();
    expect(progressCallbacks).toHaveLength(2);

    const first = batch.snapshot().uploads;
    expect(batch.snapshot().uploads).toBe(first);

    progressCallbacks[0]?.(1, 5);
    const second = batch.snapshot().uploads;

    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
    expect(second[0]?.progress).toBe(20);
    expect(first[0]?.progress).toBe(0);
    // the untouched child keeps its reference, so memoized rows for it can skip rendering
    expect(second[1]).toBe(first[1]);
  });

  describe("change event on status-only updates", () => {
    it("emits change with paused statuses when the batch pauses", () => {
      const { batch, statuses } = startManualBatch();

      batch.pause();

      expect(statuses.at(-1)).toEqual(["paused", "paused"]);
    });

    it("emits change with uploading statuses when the batch resumes", () => {
      const { batch, statuses } = startManualBatch();
      batch.pause();

      batch.resume();

      expect(statuses.at(-1)).toEqual(["uploading", "uploading"]);
    });

    it("emits change when a single child is paused directly", () => {
      const { batch, statuses } = startManualBatch();

      batch.uploads[0]?.pause();

      expect(statuses.at(-1)).toEqual(["paused", "uploading"]);
    });

    it("emits change once per child that settles, not twice", async () => {
      const { batch, statuses } = startManualBatch();

      batch.uploads[0]?.cancel();
      await waitForMicrotasks();

      // one change for "canceled"; the statusChange is not forwarded a second time
      expect(statuses).toEqual([["canceled", "uploading"]]);
    });
  });

  it("respects concurrency limits", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const { provider } = createMockProvider({
      uploadBehavior: {
        onStart: (_file, _options, callbacks) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          queueMicrotask(() => {
            inFlight -= 1;
            callbacks.onProgress(1, 1);
            callbacks.onSuccess("https://example.com/file");
          });
        },
        type: "manual",
      },
    });

    const manager = new StorageManager(provider);
    const files = [
      createTestFile("1.txt"),
      createTestFile("2.txt"),
      createTestFile("3.txt"),
      createTestFile("4.txt"),
    ];

    manager.uploadFiles(files, (file) => ({ path: `uploads/${file.name}` }), {
      concurrency: 2,
    });

    await waitForUploadSettled();
    await waitForMicrotasks();

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(maxInFlight).toBe(2);
  });

  it("continues on error by default and emits batch success", async () => {
    const { provider } = createMockProvider({
      uploadBehavior: {
        onStart: (file, _options, callbacks) => {
          queueMicrotask(() => {
            if (file.name === "2.txt") {
              callbacks.onError(
                Object.assign(new Error("failed"), {
                  code: "storage/unauthorized",
                })
              );
              return;
            }
            callbacks.onSuccess("https://example.com/file");
          });
        },
        type: "manual",
      },
    });

    const manager = new StorageManager(provider);
    const batch = manager.uploadFiles(
      [
        createTestFile("1.txt"),
        createTestFile("2.txt"),
        createTestFile("3.txt"),
      ],
      (file) => ({ path: `uploads/${file.name}` })
    );

    const onSuccess = mock(() => {});
    const onError = mock(() => {});
    batch.on("success", onSuccess);
    batch.on("error", onError);

    await waitForUploadSettled();

    expect(onSuccess).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(batch.snapshot().completedCount).toBe(2);
    expect(batch.snapshot().failedCount).toBe(1);
  });

  it("fails fast when continueOnError is false", async () => {
    let call = 0;
    const { provider } = createMockProvider({
      uploadBehavior: {
        onStart: (_file, _options, callbacks, task) => {
          call += 1;
          if (call === 1) {
            queueMicrotask(() => {
              callbacks.onError(
                Object.assign(new Error("first failure"), {
                  code: "storage/unauthorized",
                })
              );
            });
            return;
          }

          queueMicrotask(() => {
            callbacks.onSuccess("https://example.com/file");
          });
          task.cancel = mock(() => {});
        },
        type: "manual",
      },
    });

    const manager = new StorageManager(provider);
    const batch = manager.uploadFiles(
      [
        createTestFile("1.txt"),
        createTestFile("2.txt"),
        createTestFile("3.txt"),
      ],
      (file) => ({ path: `uploads/${file.name}` }),
      { concurrency: 1, continueOnError: false }
    );

    const onSuccess = mock(() => {});
    const onError = mock(() => {});
    batch.on("success", onSuccess);
    batch.on("error", onError);

    await waitForUploadSettled();

    expect(onError).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(batch.uploads.some((h) => h.upload.status === "canceled")).toBe(
      true
    );
  });

  it("emits uploadRetry when a child upload retries", async () => {
    const { provider } = createMockProvider({
      uploadBehavior: {
        async: true,
        error: Object.assign(new Error("transient"), {
          code: "storage/retry-limit-exceeded",
        }),
        failures: 1,
        type: "failThenSucceed",
      },
    });

    const manager = new StorageManager(provider);
    const batch = manager.uploadFiles(
      [createTestFile("1.txt")],
      () => ({
        path: "uploads/1.txt",
        retry: { initialDelayMs: 10, jitter: false, maxRetries: 1 },
      }),
      { concurrency: 1 }
    );

    const onUploadRetry = mock(() => {});
    batch.on("uploadRetry", onUploadRetry);

    await waitForMicrotasks();
    await waitForMicrotasks();

    expect(onUploadRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 2,
        delayMs: 10,
        maxAttempts: 2,
      })
    );

    await delay(20);
    await waitForMicrotasks();

    expect(batch.snapshot().completedCount).toBe(1);
  });

  it("emits batch progress and per-upload events", async () => {
    const { provider } = createMockProvider({
      uploadBehavior: {
        async: true,
        progress: [
          { bytesTransferred: 0, totalBytes: 5 },
          { bytesTransferred: 5, totalBytes: 5 },
        ],
        type: "success",
      },
    });

    const manager = new StorageManager(provider);
    const batch = manager.uploadFiles(
      [createTestFile("1.txt"), createTestFile("2.txt")],
      (file) => ({ path: `uploads/${file.name}` }),
      { concurrency: 2 }
    );

    const onProgress = mock(() => {});
    const onChange = mock(() => {});
    const onUploadSuccess = mock(() => {});

    batch.on("progress", onProgress);
    batch.on("change", onChange);
    batch.on("uploadSuccess", onUploadSuccess);

    await waitForUploadSettled();

    expect(onProgress.mock.calls.length).toBeGreaterThan(0);
    expect(onChange.mock.calls.length).toBeGreaterThan(0);
    expect(onUploadSuccess.mock.calls.length).toBe(2);
  });

  it("supports batch cancel, pause, and resume", () => {
    const { provider } = createMockProvider({
      uploadBehavior: {
        onStart: () => {},
        type: "manual",
      },
    });

    const manager = new StorageManager(provider);
    const batch = manager.uploadFiles(
      [
        createTestFile("1.txt"),
        createTestFile("2.txt"),
        createTestFile("3.txt"),
      ],
      (file) => ({ path: `uploads/${file.name}` }),
      { concurrency: 1 }
    );

    expect(batch.uploads[0]?.upload.status).toBe("uploading");
    expect(batch.uploads[1]?.upload.status).toBe("queued");

    batch.pause();
    expect(batch.uploads[0]?.upload.status).toBe("paused");

    batch.resume();
    expect(batch.uploads[0]?.upload.status).toBe("uploading");

    batch.cancel();
    expect(batch.uploads.every((h) => h.upload.status === "canceled")).toBe(
      true
    );
  });

  it("completes all 10 uploads without leaving any stuck in uploading", async () => {
    const { provider } = createMockProvider({
      uploadBehavior: {
        onStart: (file, _options, callbacks) => {
          callbacks.onProgress(0, file.size);
          queueMicrotask(() => {
            void (async () => {
              callbacks.onProgress(file.size, file.size);
              await waitForMicrotasks();
              callbacks.onSuccess(`https://example.com/${file.name}`);
            })();
          });
        },
        type: "manual",
      },
    });

    const manager = new StorageManager(provider);
    const files = Array.from({ length: 10 }, (_, i) =>
      createTestFile(`${i + 1}.txt`)
    );
    const batch = manager.uploadFiles(
      files,
      (file) => ({ path: `uploads/${file.name}` }),
      { concurrency: 3 }
    );

    await waitForBatchTerminal(batch);

    const stuck = batch.uploads.filter((handle) => {
      const { status } = handle.upload;
      return status === "uploading" || status === "queued";
    });
    expect(stuck).toHaveLength(0);
    expect(batch.snapshot().completedCount).toBe(10);
  });

  it("does not restart canceled queued uploads and leave them stuck uploading", async () => {
    const { provider, spies } = createMockProvider({
      uploadBehavior: {
        onStart: (_file, _options, callbacks) => {
          queueMicrotask(() => {
            callbacks.onProgress(1, 1);
            callbacks.onSuccess("https://example.com/file");
          });
        },
        type: "manual",
      },
    });

    const manager = new StorageManager(provider);
    const files = Array.from({ length: 10 }, (_, i) =>
      createTestFile(`${i + 1}.txt`)
    );
    const batch = manager.uploadFiles(
      files,
      (file) => ({ path: `uploads/${file.name}` }),
      { concurrency: 3 }
    );

    batch.uploads[8]?.cancel();
    batch.uploads[9]?.cancel();

    await waitForBatchTerminal(batch);

    expect(batch.uploads[8]?.upload.status).toBe("canceled");
    expect(batch.uploads[9]?.upload.status).toBe("canceled");
    expect(
      batch.uploads.filter((h) => h.upload.status === "success")
    ).toHaveLength(8);
    expect(spies.upload.mock.calls.length).toBe(8);
  });
});
