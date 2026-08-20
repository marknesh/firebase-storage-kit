import { describe, expect, it } from "bun:test";

import { ConflictError } from "../src/core/path-conflict";
import { StorageManager } from "../src/core/storage-manager";
import {
  createMockProvider,
  waitForMicrotasks,
  waitForUploadSettled,
} from "./helpers/mock-provider";
import { createTestFile } from "./helpers/test-file";

const settleConflictChecks = async (): Promise<void> => {
  for (let index = 0; index < 10; index += 1) {
    await waitForMicrotasks();
  }
};

describe("upload conflict handling", () => {
  it("defaults to overwrite without checking existence", async () => {
    const { provider, spies } = createMockProvider({
      uploadBehavior: { async: true, type: "success" },
    });
    const manager = new StorageManager(provider);

    const handle = manager.uploadFile(createTestFile("photo.jpg"), {
      path: "uploads/photo.jpg",
    });
    await waitForUploadSettled();

    expect(spies.exists).not.toHaveBeenCalled();
    expect(spies.upload).toHaveBeenCalledTimes(1);
    expect(handle.upload.status).toBe("success");
  });

  it("supports explicit overwrite without checking existence", async () => {
    const { provider, spies } = createMockProvider({
      uploadBehavior: { async: true, type: "success" },
    });
    const manager = new StorageManager(provider);

    manager.uploadFile(createTestFile("photo.jpg"), {
      onConflict: "overwrite",
      path: "uploads/photo.jpg",
    });
    await waitForUploadSettled();

    expect(spies.exists).not.toHaveBeenCalled();
    expect(spies.upload).toHaveBeenCalledTimes(1);
  });

  it("fails before provider upload when the path exists", async () => {
    const { provider, spies } = createMockProvider({
      exists: async () => {
        await Promise.resolve();
        return true;
      },
    });
    const manager = new StorageManager(provider);

    const handle = manager.uploadFile(createTestFile("photo.jpg"), {
      onConflict: "fail",
      path: "uploads/photo.jpg",
    });
    await settleConflictChecks();

    expect(spies.upload).not.toHaveBeenCalled();
    expect(handle.upload.status).toBe("error");
    expect(handle.upload.error).toBeInstanceOf(ConflictError);
  });

  it("uploads when fail mode finds no existing object", async () => {
    const { provider, spies } = createMockProvider({
      exists: async () => {
        await Promise.resolve();
        return false;
      },
      uploadBehavior: { async: true, type: "success" },
    });
    const manager = new StorageManager(provider);

    const handle = manager.uploadFile(createTestFile("photo.jpg"), {
      onConflict: "fail",
      path: "uploads/photo.jpg",
    });
    await settleConflictChecks();

    expect(spies.exists).toHaveBeenCalledTimes(1);
    expect(spies.upload).toHaveBeenCalledTimes(1);
    expect(handle.upload.status).toBe("success");
  });

  it("propagates existence lookup errors without retrying", async () => {
    const lookupError = new Error("permission denied");
    const { provider, spies } = createMockProvider({
      exists: async () => {
        await Promise.resolve();
        throw lookupError;
      },
    });
    const manager = new StorageManager(provider);

    const handle = manager.uploadFile(createTestFile("photo.jpg"), {
      onConflict: "fail",
      path: "uploads/photo.jpg",
      retry: { initialDelayMs: 1, maxRetries: 3 },
    });
    await settleConflictChecks();

    expect(spies.exists).toHaveBeenCalledTimes(1);
    expect(spies.upload).not.toHaveBeenCalled();
    expect(handle.upload.error).toBe(lookupError);
  });

  it("does not upload after cancellation during a conflict check", async () => {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const { provider, spies } = createMockProvider({
      exists: async () => {
        const result = await promise;
        return result;
      },
    });
    const manager = new StorageManager(provider);

    const handle = manager.uploadFile(createTestFile("photo.jpg"), {
      onConflict: "fail",
      path: "uploads/photo.jpg",
    });
    handle.cancel();
    resolve(false);
    await settleConflictChecks();

    expect(handle.upload.status).toBe("canceled");
    expect(spies.upload).not.toHaveBeenCalled();
  });
});
