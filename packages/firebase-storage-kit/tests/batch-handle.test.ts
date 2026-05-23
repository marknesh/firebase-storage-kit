import { describe, expect, it, mock } from "bun:test";

import { StorageManager } from "../src/core/storage-manager";
import {
  createMockProvider,
  waitForMicrotasks,
  waitForUploadSettled,
} from "./helpers/mock-provider";
import { createTestFile } from "./helpers/test-file";

async function waitForBatchTerminal(
  batch: ReturnType<StorageManager["uploadFiles"]>,
  timeoutMs = 3000,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("batch did not finish in time"));
    }, timeoutMs);

    const check = () => {
      const terminal = batch.uploads.every((h) => {
        const s = h.upload.status;
        return s === "success" || s === "error" || s === "canceled";
      });
      if (terminal) {
        clearTimeout(timeout);
        resolve();
      }
    };

    batch.on("change", check);
    check();
  });
}

describe("BatchHandle via StorageManager.uploadFiles", () => {
  it("respects concurrency limits", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const { provider } = createMockProvider({
      uploadBehavior: {
        type: "manual",
        onStart: (_file, _options, callbacks) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          queueMicrotask(() => {
            inFlight--;
            callbacks.onProgress(1, 1);
            callbacks.onSuccess("https://example.com/file");
          });
        },
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
        type: "manual",
        onStart: (file, _options, callbacks) => {
          queueMicrotask(() => {
            if (file.name === "2.txt") {
              callbacks.onError(new Error("failed"));
              return;
            }
            callbacks.onSuccess("https://example.com/file");
          });
        },
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
        type: "manual",
        onStart: (_file, _options, callbacks, task) => {
          call++;
          if (call === 1) {
            queueMicrotask(() => {
              callbacks.onError(new Error("first failure"));
            });
            return;
          }

          queueMicrotask(() => {
            callbacks.onSuccess("https://example.com/file");
          });
          task.cancel = mock(() => {});
        },
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
      { concurrency: 1, continueOnError: false },
    );

    const onSuccess = mock(() => {});
    const onError = mock(() => {});
    batch.on("success", onSuccess);
    batch.on("error", onError);

    await waitForUploadSettled();

    expect(onError).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(batch.uploads.some((h) => h.upload.status === "canceled")).toBe(
      true,
    );
  });

  it("emits batch progress and per-upload events", async () => {
    const { provider } = createMockProvider({
      uploadBehavior: {
        type: "success",
        progress: [
          { bytesTransferred: 0, totalBytes: 5 },
          { bytesTransferred: 5, totalBytes: 5 },
        ],
        async: true,
      },
    });

    const manager = new StorageManager(provider);
    const batch = manager.uploadFiles(
      [createTestFile("1.txt"), createTestFile("2.txt")],
      (file) => ({ path: `uploads/${file.name}` }),
      { concurrency: 2 },
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

  it("supports batch cancel, pause, and resume", async () => {
    const { provider } = createMockProvider({
      uploadBehavior: {
        type: "manual",
        onStart: () => {},
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
      { concurrency: 1 },
    );

    expect(batch.uploads[0]?.upload.status).toBe("uploading");
    expect(batch.uploads[1]?.upload.status).toBe("queued");

    batch.pause();
    expect(batch.uploads[0]?.upload.status).toBe("paused");

    batch.resume();
    expect(batch.uploads[0]?.upload.status).toBe("uploading");

    batch.cancel();
    expect(batch.uploads.every((h) => h.upload.status === "canceled")).toBe(
      true,
    );
  });

  it("completes all 10 uploads without leaving any stuck in uploading", async () => {
    const { provider } = createMockProvider({
      uploadBehavior: {
        type: "manual",
        onStart: (file, _options, callbacks) => {
          callbacks.onProgress(0, file.size);
          queueMicrotask(async () => {
            callbacks.onProgress(file.size, file.size);
            await waitForMicrotasks();
            callbacks.onSuccess(`https://example.com/${file.name}`);
          });
        },
      },
    });

    const manager = new StorageManager(provider);
    const files = Array.from({ length: 10 }, (_, i) =>
      createTestFile(`${i + 1}.txt`),
    );
    const batch = manager.uploadFiles(
      files,
      (file) => ({ path: `uploads/${file.name}` }),
      { concurrency: 3 },
    );

    await waitForBatchTerminal(batch);

    const stuck = batch.uploads.filter((h) => {
      const s = h.upload.status;
      return s === "uploading" || s === "queued";
    });
    expect(stuck).toHaveLength(0);
    expect(batch.snapshot().completedCount).toBe(10);
  });

  it("does not restart canceled queued uploads and leave them stuck uploading", async () => {
    const { provider, spies } = createMockProvider({
      uploadBehavior: {
        type: "manual",
        onStart: (_file, _options, callbacks) => {
          queueMicrotask(() => {
            callbacks.onProgress(1, 1);
            callbacks.onSuccess("https://example.com/file");
          });
        },
      },
    });

    const manager = new StorageManager(provider);
    const files = Array.from({ length: 10 }, (_, i) =>
      createTestFile(`${i + 1}.txt`),
    );
    const batch = manager.uploadFiles(
      files,
      (file) => ({ path: `uploads/${file.name}` }),
      { concurrency: 3 },
    );

    batch.uploads[8]?.cancel();
    batch.uploads[9]?.cancel();

    await waitForBatchTerminal(batch);

    expect(batch.uploads[8]?.upload.status).toBe("canceled");
    expect(batch.uploads[9]?.upload.status).toBe("canceled");
    expect(
      batch.uploads.filter((h) => h.upload.status === "success"),
    ).toHaveLength(8);
    expect(spies.upload.mock.calls.length).toBe(8);
  });
});
